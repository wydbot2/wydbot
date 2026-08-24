/**
 * Challenge LUT re-exports.
 * Runtime SoT is `crypto-material-store`.
 * These re-exports keep unit tests that import table constants working.
 */
export {
  EMBEDDED_SPIRAL_TABLE as SPIRAL_TABLE,
  EMBEDDED_EXP_TABLE_NORMAL as EXP_TABLE_NORMAL,
  EMBEDDED_EXP_TABLE_CELESTIAL as EXP_TABLE_CELESTIAL,
} from './crypto-material-embedded';
