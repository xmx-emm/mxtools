import {beforeEach, describe, expect, it} from 'vitest';
import {
  appConfirmationState,
  confirm,
  resolveAppConfirmation,
  runAppConfirmationAction,
} from '@/utils/app_confirmation.ts';

describe('app confirmation actions', () => {
  beforeEach(() => {
    resolveAppConfirmation(false);
  });

  it('closes the dialog and waits for an optional action before resolving', async () => {
    let actionCalled = false;
    const pending = confirm('message', {
      title: 'title',
      actionText: 'Review',
      onAction: async () => {
        await Promise.resolve();
        actionCalled = true;
      },
    });

    expect(appConfirmationState.open).toBe(true);
    expect(appConfirmationState.actionText).toBe('Review');

    await runAppConfirmationAction();

    expect(actionCalled).toBe(true);
    expect(appConfirmationState.open).toBe(false);
    await expect(pending).resolves.toBe(false);
  });

  it('keeps the existing two-button flow when no optional action is configured', async () => {
    const pending = confirm('message', {title: 'title'});

    resolveAppConfirmation(true);

    await expect(pending).resolves.toBe(true);
    expect(appConfirmationState.actionText).toBeUndefined();
  });

  it('runs an asynchronous optional action only once', async () => {
    let releaseAction!: () => void;
    let actionCalls = 0;
    const actionDone = new Promise<void>((resolve) => {
      releaseAction = resolve;
    });
    const pending = confirm('message', {
      title: 'title',
      actionText: 'Review',
      onAction: async () => {
        actionCalls += 1;
        await actionDone;
      },
    });

    const firstRun = runAppConfirmationAction();
    const secondRun = runAppConfirmationAction();

    expect(actionCalls).toBe(1);
    expect(appConfirmationState.actionRunning).toBe(true);
    releaseAction();
    await Promise.all([firstRun, secondRun]);
    await expect(pending).resolves.toBe(false);
  });
});
