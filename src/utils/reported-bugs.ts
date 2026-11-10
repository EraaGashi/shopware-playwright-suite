import type { TestInfo } from '@playwright/test';
import type { ReportedBug } from '../config/types';

/** Drops URLs of already reported shop bugs (cfg.reportedBugs) and notes each one as an "accepted" annotation. */
export function withoutReportedBugs(urls: string[], bugs: ReportedBug[] | undefined, testInfo: TestInfo): string[] {
  return urls.filter((url) => {
    const bug = bugs?.find((b) => (typeof b.match === 'string' ? url.includes(b.match) : b.match.test(url)));
    if (bug) testInfo.annotations.push({ type: 'accepted', description: `${url} — ${bug.reason}` });
    return !bug;
  });
}
