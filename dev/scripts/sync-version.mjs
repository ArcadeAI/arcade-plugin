const STABLE_VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

const parseVersion = (value, field) => {
  if (typeof value !== "string" || !STABLE_VERSION.test(value)) {
    throw new Error(`${field} must be a stable X.Y.Z version without leading zeroes`);
  }
  return value.split(".").map(BigInt);
};

/**
 * Permit only stable releases tagged exactly vX.Y.Z. Equal versions are safe
 * only when the caller has verified the projected destination tree is identical.
 */
export const assertReleaseVersion = ({ sourceVersion, destinationVersion, tag, sameTree = false }) => {
  const source = parseVersion(sourceVersion, "sourceVersion");
  const destination = parseVersion(destinationVersion, "destinationVersion");
  if (tag !== `v${sourceVersion}`) {
    throw new Error(`release tag must be v${sourceVersion}; received ${String(tag)}`);
  }

  for (let i = 0; i < source.length; i++) {
    if (source[i] > destination[i]) return;
    if (source[i] < destination[i]) {
      throw new Error(`refusing version downgrade from ${destinationVersion} to ${sourceVersion}`);
    }
  }
  if (sameTree !== true) {
    throw new Error(`version ${sourceVersion} already exists with different content; publish a newer release`);
  }
};
