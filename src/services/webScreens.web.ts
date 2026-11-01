import { enableScreens } from 'react-native-screens';

/**
 * On web react-native-screens is disabled by default, so the tab navigator leaves every tab mounted, absolutely
 * positioned and visible. Our tab scenes are transparent (one shared gradient behind them), so Today, Timetable, Focus…
 * all showed through each other. Enabling screens makes inactive tabs `display: none` on web, as on a phone.
 */
enableScreens(true);
