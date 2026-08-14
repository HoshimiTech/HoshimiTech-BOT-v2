// 残り秒数を計算する関数
function calculateRemainingSeconds(pomodoroState) {
	if (pomodoroState?.paused) {
		return pomodoroState.part?.pausedRemainingSeconds ?? 0;
	}

	if (!pomodoroState.part?.endTimestamp) return 0;
	const now = Date.now();
	const remaining = Math.max(
		0,
		Math.ceil((pomodoroState.part.endTimestamp - now) / 1000),
	);
	return remaining;
}

// ポモドーロタイマーの進捗状況をパーセンテージで計算する関数
function calculateStatusPercentage(pomodoroState) {
	const options = pomodoroState.config?.options;
	const partType = pomodoroState.part?.type;
	const partEndTimestamp = pomodoroState.part?.endTimestamp;

	// 各変数が未定義の場合は0%として扱う
	if (!options || !partType || !partEndTimestamp) {
		return 0;
	}

	const { workTime, breakTime, longBreakTime } = options;
	let totalSeconds = 0;
	switch (partType) {
		case 'work':
			totalSeconds = workTime * 60;
			break;
		case 'break':
			totalSeconds = breakTime * 60;
			break;
		case 'longBreak':
			totalSeconds = longBreakTime * 60;
			break;
	}

	// パートの全体時間が0の場合は0%として扱う
	if (totalSeconds === 0) {
		return 0;
	}

	const remainingSeconds = calculateRemainingSeconds(pomodoroState);
	const progress = ((totalSeconds - remainingSeconds) / totalSeconds) * 100;
	return Math.min(100, Math.max(0, Math.floor(progress)));
}

module.exports = {
	calculateRemainingSeconds,
	calculateStatusPercentage,
};
