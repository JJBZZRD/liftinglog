/* Unit-project stand-in for react-native-svg: host components render as named elements. */
const names = ['Svg', 'Circle', 'Ellipse', 'G', 'Line', 'Path', 'Polygon', 'Polyline', 'Rect', 'Text', 'TSpan', 'Defs', 'LinearGradient', 'Stop', 'ClipPath'];
const stub = Object.fromEntries(names.map((name) => [name, name]));
module.exports = { __esModule: true, default: 'Svg', ...stub };
