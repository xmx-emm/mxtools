import {appMessages} from './app.ts';
import {windowsMessages} from './windows.ts';
import {apexMessages} from './apex.ts';
import {apexConfigMessages} from './apex-config.ts';
import {apexLaunchMessages} from './apex-launch.ts';
import {pubgMessages} from './pubg.ts';
import {gameOptimizerMessages} from './game-optimizer.ts';

export const enUS = {
  ...appMessages,
  ...windowsMessages,
  ...apexMessages,
  ...apexConfigMessages,
  ...apexLaunchMessages,
  ...pubgMessages,
  ...gameOptimizerMessages,
};

export default enUS;
