import { breakoutAction } from './breakoutAction';
import { importAction } from './importAction';
import { scaffoldAction } from './scaffoldAction';
import { uncleBobifyAction } from './uncleBobifyAction';
import { wireAction } from './wireAction';

export * from './types';
export { breakoutAction, importAction, scaffoldAction, uncleBobifyAction, wireAction };

export const ACTIONS = [
  scaffoldAction,
  importAction,
  wireAction,
  breakoutAction,
  uncleBobifyAction,
] as const;
