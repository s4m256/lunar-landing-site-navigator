import type { Plugin } from 'vite';

export interface ThirdPartyLicensesOptions {
  /** Output file name inside the build directory. Default: "third-party-licenses.txt". */
  fileName?: string;
}

export function thirdPartyLicenses(options?: ThirdPartyLicensesOptions): Plugin;
