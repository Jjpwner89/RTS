// Which build this is. The deploy stamps it (tools/stamp.sh) with the commit it was made from; a checkout that has
// not been stamped says "dev". Shown on the front page and in the game menu, and put in every error report.
export const BUILD = { sha: 'dev', at: '' };
