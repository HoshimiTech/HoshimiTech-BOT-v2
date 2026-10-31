const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { Readable } = require('stream');
const sevenZip = require('7zip-min');

const execAsync = promisify(exec);

// Constants
const dirname = require('../lib/defineDirname.js');
const LIB_DIR = path.resolve(dirname, 'lib/pomodoro/voicevox');
const VOICEVOX_ENGINE_PATH = path.join(
	LIB_DIR,
	process.platform === 'win32' ? 'run.exe' : 'run',
);
const VOICEVOX_MANIFEST_PATH = path.join(LIB_DIR, 'engine_manifest.json');
const GITHUB_RELEASES_API_URL =
	'https://api.github.com/repos/VOICEVOX/voicevox_engine/releases/latest';

const PLATFORM_CONFIG = {
	win32: {
		filePattern: /^voicevox_engine-windows-cpu-(\d+(?:\.\d+)+)\.7z\.001$/,
		executableName: 'run.exe',
	},
	linux: {
		filePattern:
			/^voicevox_engine-linux-cpu-(arm64|x64)-(\d+(?:\.\d+)+)\.7z\.001$/,
		executableName: 'run',
	},
};

async function ensureDir(dir) {
	try {
		await fsp.mkdir(dir, { recursive: true });
	} catch (e) {
		if (e.code !== 'EEXIST') throw e;
	}
}

async function remove(targetPath) {
	try {
		const stat = await fsp.stat(targetPath);
		if (stat.isDirectory()) {
			const files = await fsp.readdir(targetPath);
			await Promise.all(
				files.map((file) => remove(path.join(targetPath, file))),
			);
			await fsp.rmdir(targetPath);
		} else {
			await fsp.unlink(targetPath);
		}
	} catch (e) {
		if (e.code !== 'ENOENT') throw e;
	}
}

async function move(src, dest, overwrite = true) {
	try {
		if (overwrite) {
			await remove(dest);
		}
		await fsp.rename(src, dest);
	} catch (e) {
		if (e.code === 'EXDEV') {
			// Cross-device move fallback
			await fsp.copyFile(src, dest);
			await fsp.unlink(src);
		} else {
			throw e;
		}
	}
}

async function getLatestVoiceVoxUrl() {
	const platform = process.platform;
	const config = PLATFORM_CONFIG[platform];

	if (!config) {
		return null;
	}

	// Fetch the latest release information from GitHub API
	const res = await fetch(GITHUB_RELEASES_API_URL, {
		headers: { Accept: 'application/vnd.github+json' },
	});
	if (!res.ok) {
		throw new Error(`最新リリースの取得に失敗しました: ${res.statusText}`);
	}
	const release = await res.json();
	const architecture = process.arch === 'arm64' ? 'arm64' : 'x64';
	const asset = release.assets.find((item) => {
		if (!config.filePattern.test(item.name)) return false;
		return platform === 'win32' || item.name.includes(`-${architecture}-`);
	});
	if (!asset) return null;

	return {
		url: asset.browser_download_url,
		name: asset.name,
		version: asset.name.match(config.filePattern).at(-1),
	};
}

function getLocalVersion() {
	if (!fs.existsSync(VOICEVOX_MANIFEST_PATH)) {
		return null;
	}
	try {
		const manifest = JSON.parse(
			fs.readFileSync(VOICEVOX_MANIFEST_PATH, 'utf-8'),
		);
		return manifest.version;
	} catch (error) {
		console.warn(
			'WARN: マニフェストファイルの読み込みに失敗しました:',
			error.message,
		);
		return null;
	}
}

function shouldSkipDownload(version) {
	if (!fs.existsSync(VOICEVOX_ENGINE_PATH)) {
		return false;
	}

	const localVersion = getLocalVersion();
	return localVersion && version && localVersion === version;
}

async function downloadFile(url, dest, version) {
	if (shouldSkipDownload(version)) {
		console.warn(
			`WARN: 既に最新バージョンのVOICEVOX Engineが存在します。ダウンロードをスキップします。 (version: ${getLocalVersion()})`,
		);
		return false;
	}

	// 既存のVOICEVOXファイルをクリーンアップ
	console.info('INFO: [開始] 既存のVOICEVOXファイルをクリーンアップします。');
	const items = await fsp.readdir(LIB_DIR);
	for (const item of items) {
		await remove(path.join(LIB_DIR, item));
	}
	console.info(
		'INFO: [完了] lib/pomodoro/voicevox の古いデータのクリーンアップが完了しました。',
	);

	const startTime = Date.now();
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`ダウンロード失敗: ${res.statusText}`);
	}

	const total = Number(res.headers.get('content-length')) || 0;
	let downloaded = 0;

	const nodeStream = Readable.fromWeb(res.body);
	const fileStream = fs.createWriteStream(dest);

	const BAR_WIDTH = 40;

	nodeStream.on('data', (chunk) => {
		downloaded += chunk.length;
		const downloadedMiB = downloaded / 1024 / 1024;

		if (total) {
			const percent = downloaded / total;
			const filled = Math.round(BAR_WIDTH * percent);

			const bar = '='.repeat(filled) + ' '.repeat(BAR_WIDTH - filled);
			const elapsed = (Date.now() - startTime) / 1000;
			const totalMiB = total / 1024 / 1024;
			const speed = elapsed > 0 ? downloadedMiB / elapsed : 0;
			const remain = speed > 0 ? (totalMiB - downloadedMiB) / speed : 0;

			process.stdout.write(
				`\r[${bar}] ${(percent * 100).toFixed(1)}% ` +
					`${downloadedMiB.toFixed(1)} / ${totalMiB.toFixed(1)} MiB ` +
					`速度: ${speed.toFixed(1)} MiB/s ` +
					`残り: ${remain.toFixed(1)} 秒`,
			);
		} else {
			process.stdout.write(`\r${downloadedMiB.toFixed(1)} MiB`);
		}
	});

	await new Promise((resolve, reject) => {
		nodeStream.pipe(fileStream);
		nodeStream.on('error', reject);
		fileStream.on('finish', resolve);
		fileStream.on('error', reject);
	});
	return true;
}

async function makeExecutable(filePath) {
	if (process.platform !== 'linux') {
		return;
	}

	try {
		await execAsync(`chmod +x "${filePath}"`);
		console.info(`INFO: [完了] 実行権限を付与しました: ${filePath}`);
	} catch (err) {
		throw new Error(
			`実行権限の付与に失敗しました: ${err.message || String(err)}`,
			{ cause: err },
		);
	}
}

function getVoicevoxExecutablePath() {
	const platform = process.platform;
	const config = PLATFORM_CONFIG[platform];

	if (!config) {
		return null;
	}

	const executablePath = path.join(LIB_DIR, config.executableName);

	if (fs.existsSync(executablePath)) {
		console.info(
			`INFO: [情報] 実行ファイルが見つかりました: ${executablePath}`,
		);
		return executablePath;
	}

	console.info(`INFO: [情報] 実行ファイルが見つかりません: ${executablePath}`);
	return null;
}

async function extractArchive(archivePath, extractDir) {
	try {
		const platform = process.platform;
		const config = PLATFORM_CONFIG[platform];
		const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
		const sourceDirName =
			platform === 'win32' ? 'windows-cpu' : `linux-cpu-${arch}`;
		const tempDir = path.join(extractDir, `.voicevox-extract-${process.pid}`);
		await ensureDir(tempDir);
		await sevenZip.unpack(archivePath, tempDir);
		const sourceDir = path.join(tempDir, sourceDirName);
		if (!fs.existsSync(sourceDir))
			throw new Error(`${sourceDirName} フォルダが見つかりません`);
		for (const item of await fsp.readdir(sourceDir)) {
			await move(path.join(sourceDir, item), path.join(extractDir, item), true);
		}
		await remove(tempDir);
		const executable = path.join(extractDir, config.executableName);
		if (!fs.existsSync(executable))
			throw new Error(`${config.executableName} が展開されませんでした`);
		await makeExecutable(executable);
	} catch (err) {
		throw new Error(`7z解凍エラー: ${err.message || String(err)}`, {
			cause: err,
		});
	}
}

function logSetupHeader(platform) {
	console.info('==============================================');
	console.info('VOICEVOX セットアップ処理を開始します。');
	console.info('この処理は一度 VOICEVOX をダウンロードする必要があるため、');
	console.info('数分以上時間がかかる場合があります。しばらくお待ちください。');
	console.info('==============================================');
	console.info(`INFO: [情報] 検出されたプラットフォーム: ${platform}`);
}

async function setupVoicevox() {
	// lib/voicevoxディレクトリが無ければ作成
	await ensureDir(LIB_DIR);

	const platform = process.platform;
	if (!PLATFORM_CONFIG[platform]) {
		throw new Error(`サポートされていないプラットフォーム: ${platform}`);
	}

	logSetupHeader(platform);

	const releaseAsset = await getLatestVoiceVoxUrl();
	if (!releaseAsset) {
		const config = PLATFORM_CONFIG[platform];
		const expectedPattern = config.filePattern.toString();
		throw new Error(`${expectedPattern}が見つかりませんでした`);
	}

	const { url: downloadUrl, name: fileName, version } = releaseAsset;
	const filePath = path.join(LIB_DIR, fileName);

	console.info('INFO: [開始] ダウンロードを開始します:', downloadUrl);
	const downloaded = await downloadFile(downloadUrl, filePath, version);
	if (!downloaded) return;
	process.stdout.write('\n');
	console.info('INFO: [完了] ダウンロードが完了しました:', filePath);

	if (platform === 'win32' || platform === 'linux') {
		await extractArchive(filePath, LIB_DIR);
		await remove(filePath);
		console.info('INFO: [完了] セットアップが完了しました。');
	}

	console.info('INFO: [完了] VOICEVOX セットアップ処理が完了しました。');
}

// この関数をエクスポートして外部から使用可能にする
module.exports = {
	getVoicevoxExecutablePath,
	setupVoicevox,
};

// 直接実行された場合のみセットアップを実行
if (require.main === module) {
	setupVoicevox().catch((e) => {
		console.error('ERROR: [情報] エラー:', e);
		process.exit(1);
	});
}
