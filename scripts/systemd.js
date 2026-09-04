const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const serviceName = 'hoshimitech-bot.service';
const projectRoot = path.resolve(__dirname, '..');
const workingDirectory = path.join(__dirname, 'systemd');
const templatePath = path.join(__dirname, 'systemd', serviceName);
const targetPath = path.join('/etc', 'systemd', 'system', serviceName);

function isInstalled() {
	return fs.existsSync(targetPath);
}

function guidanceForInstallFirst() {
	console.error(
		`The service is not installed yet. Run: sudo npm run prod:install`,
	);
}

function ensureRoot() {
	if (typeof process.getuid === 'function' && process.getuid() !== 0) {
		throw new Error(
			'systemd registration requires root privileges. Run this command with sudo.',
		);
	}
}

function renderServiceDefinition() {
	const template = fs.readFileSync(templatePath, 'utf8');
	return template
		.replace('{{WORKING_DIRECTORY}}', workingDirectory)
		.replace('{{PROJECT_ROOT}}', projectRoot);
}

function syncInstalledServiceDefinition() {
	const rendered = renderServiceDefinition();
	const current = fs.existsSync(targetPath)
		? fs.readFileSync(targetPath, 'utf8')
		: null;

	if (current !== rendered) {
		fs.writeFileSync(targetPath, rendered, 'utf8');
		execFileSync('systemctl', ['daemon-reload'], { stdio: 'inherit' });
	}
}

function install() {
	ensureRoot();

	if (isInstalled()) {
		syncInstalledServiceDefinition();
		console.log(
			`The service is already installed. Start it with: sudo npm run prod:start`,
		);
		return;
	}

	const rendered = renderServiceDefinition();

	fs.writeFileSync(targetPath, rendered, 'utf8');
	execFileSync('systemctl', ['daemon-reload'], { stdio: 'inherit' });
	execFileSync('systemctl', ['enable', serviceName], { stdio: 'inherit' });
	console.log(
		`Installation completed. Start the service with: sudo npm run prod:start`,
	);
}

function uninstall() {
	ensureRoot();

	if (!isInstalled()) {
		console.log(
			`The service is already uninstalled. Install first with: sudo npm run prod:install`,
		);
		return;
	}

	try {
		execFileSync('systemctl', ['disable', '--now', serviceName], {
			stdio: 'inherit',
		});
	} catch (_error) {
		void _error;
		// The service may already be stopped or not installed.
	}

	if (fs.existsSync(targetPath)) {
		fs.unlinkSync(targetPath);
	}

	execFileSync('systemctl', ['daemon-reload'], { stdio: 'inherit' });
}

function start() {
	ensureRoot();
	if (!isInstalled()) {
		guidanceForInstallFirst();
		process.exit(1);
	}
	syncInstalledServiceDefinition();

	console.log(
		'Starting the service... (wait a few seconds for the bot to initialize)',
	);
	execFileSync('systemctl', ['start', '--now', serviceName], {
		stdio: 'inherit',
	});
	console.log('Service started successfully.');
}

function stop() {
	ensureRoot();
	if (!isInstalled()) {
		guidanceForInstallFirst();
		process.exit(1);
	}
	syncInstalledServiceDefinition();

	console.log('Stopping the service...');
	execFileSync('systemctl', ['stop', serviceName], {
		stdio: 'inherit',
	});
	console.log('Service stopped successfully.Clearing Docker cache...');
	execFileSync('docker', ['system', 'prune', '--volumes'], {
		stdio: 'inherit',
	});
	console.log('Service stopped successfully and Docker cache cleared.');
}

const command = process.argv[2];

try {
	if (command === 'install') {
		install();
	} else if (command === 'uninstall') {
		uninstall();
	} else if (command === 'start') {
		start();
	} else if (command === 'stop') {
		stop();
	} else {
		throw new Error(
			'Usage: node scripts/systemd.js <install|uninstall|start|stop>',
		);
	}
} catch (error) {
	console.error(error.message);
	process.exit(1);
}
