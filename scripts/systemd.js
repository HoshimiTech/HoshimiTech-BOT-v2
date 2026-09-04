const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const serviceName = 'hoshimitech-bot.service';
const projectRoot = path.resolve(__dirname, '..');
const composeDirectory = projectRoot;

const templatePath = path.join(__dirname, 'systemd', serviceName);
const targetPath = path.join('/etc', 'systemd', 'system', serviceName);

function isInstalled() {
	return fs.existsSync(targetPath);
}

function guidanceForInstallFirst() {
	console.error(
		'The service is not installed yet. Run: sudo npm run prod:install',
	);
}

function ensureRoot() {
	if (typeof process.getuid === 'function' && process.getuid() !== 0) {
		throw new Error(
			'systemd management requires root privileges. Run this command with sudo.',
		);
	}
}

function commandExists(command) {
	try {
		execFileSync('which', [command], {
			stdio: 'ignore',
		});
		return true;
	} catch {
		return false;
	}
}

function ensureDependencies() {
	if (!commandExists('systemctl')) {
		throw new Error('systemctl was not found.');
	}

	if (!commandExists('docker')) {
		throw new Error('docker was not found.');
	}
}

function renderServiceDefinition() {
	const template = fs.readFileSync(templatePath, 'utf8');
	return template
		.replaceAll('{{PROJECT_ROOT}}', projectRoot)
		.replaceAll('{{COMPOSE_DIRECTORY}}', composeDirectory);
}

function syncInstalledServiceDefinition() {
	const rendered = renderServiceDefinition();
	const current = fs.existsSync(targetPath)
		? fs.readFileSync(targetPath, 'utf8')
		: null;

	if (current !== rendered) {
		fs.writeFileSync(targetPath, rendered, 'utf8');

		console.log('systemd service definition updated.');

		execFileSync('systemctl', ['daemon-reload'], {
			stdio: 'inherit',
		});
	}
}

function install() {
	ensureRoot();
	ensureDependencies();

	const rendered = renderServiceDefinition();

	if (isInstalled()) {
		if (fs.readFileSync(targetPath, 'utf8') !== rendered) {
			fs.writeFileSync(targetPath, rendered, 'utf8');

			execFileSync('systemctl', ['daemon-reload'], {
				stdio: 'inherit',
			});

			console.log('systemd service definition updated.');
		}

		console.log('The service is already installed.');

		console.log('Start it with: sudo npm run prod:start');

		return;
	}

	fs.writeFileSync(targetPath, rendered, 'utf8');

	execFileSync('systemctl', ['daemon-reload'], {
		stdio: 'inherit',
	});

	execFileSync('systemctl', ['enable', serviceName], {
		stdio: 'inherit',
	});

	console.log('Installation completed.');
	console.log('Start the service with: sudo npm run prod:start');
}

function start() {
	ensureRoot();
	ensureDependencies();

	if (!isInstalled()) {
		guidanceForInstallFirst();
		process.exit(1);
	}
	syncInstalledServiceDefinition();

	console.log('Starting the service...');

	execFileSync('systemctl', ['start', serviceName], {
		stdio: 'inherit',
	});
	console.log('Service started successfully.');
}

function stop() {
	ensureRoot();
	ensureDependencies();

	if (!isInstalled()) {
		guidanceForInstallFirst();
		process.exit(1);
	}
	syncInstalledServiceDefinition();

	console.log('Stopping the service...');

	try {
		execFileSync('systemctl', ['stop', serviceName], {
			stdio: 'inherit',
		});
	} catch (error) {
		console.error('Failed to stop the systemd service.');
		throw error;
	}

	console.log('Removing Docker containers, images, networks, and volumes...');

	/*
	 * Composeプロジェクトに関連するリソースだけを削除する。
	 *
	 * --rmi all
	 *   Composeで使用しているイメージを削除
	 *
	 * --volumes
	 *   Composeで作成したVolumeを削除
	 *
	 * --remove-orphans
	 *   compose.ymlから外された孤立コンテナも削除
	 */
	execFileSync(
		'docker',
		['compose', 'down', '--rmi', 'all', '--volumes', '--remove-orphans'],
		{
			cwd: composeDirectory,
			stdio: 'inherit',
		},
	);

	console.log('Service stopped and Docker resources cleaned up.');
}

function uninstall() {
	ensureRoot();
	ensureDependencies();

	if (!isInstalled()) {
		console.log('The service is already uninstalled.');
		return;
	}

	console.log('Stopping and disabling the service...');

	try {
		execFileSync('systemctl', ['disable', '--now', serviceName], {
			stdio: 'inherit',
		});
	} catch {
		/*
		 * 既に停止・disable済みの場合など。
		 * 後続のファイル削除は続行する。
		 */
	}

	/*
	 * systemctl disable --now だけでは
	 * DockerのイメージやVolumeなどは削除されないため、
	 * uninstallでもComposeリソースを削除する。
	 */
	console.log('Removing Docker resources...');

	try {
		execFileSync(
			'docker',
			['compose', 'down', '--rmi', 'all', '--volumes', '--remove-orphans'],
			{
				cwd: composeDirectory,
				stdio: 'inherit',
			},
		);
	} catch {
		console.warn(
			'Failed to clean up Docker resources. Continuing uninstall...',
		);
	}

	console.log('Removing systemd service...');

	if (fs.existsSync(targetPath)) {
		fs.unlinkSync(targetPath);
	}

	execFileSync('systemctl', ['daemon-reload'], {
		stdio: 'inherit',
	});

	console.log('Uninstallation completed.');
}

const command = process.argv[2];

async function main() {
	try {
		switch (command) {
			case 'install':
				install();
				break;

			case 'start':
				start();
				break;

			case 'stop':
				stop();
				break;

			case 'uninstall':
				uninstall();
				break;

			default:
				throw new Error(
					'Usage: node scripts/systemd.js <install|start|stop|uninstall>',
				);
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));

		process.exit(1);
	}
}

main();
