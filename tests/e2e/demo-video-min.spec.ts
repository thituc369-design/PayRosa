import { chromium, test } from '@playwright/test';
import { runDemoFlow } from '../../../../../shared/demo-recorder';
import path from 'node:path';

test('demo-video-min', async () => {
  test.setTimeout(120_000);
  await runDemoFlow(
    chromium,
    path.resolve(__dirname, '..', '..', '..', 'demo-storyboard.json'),
    '/tmp/demo-recordings',
  );
});