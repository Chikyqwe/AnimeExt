// utils/token.js
function randomKey(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for(let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function buildComplexToken(key1, key2) {
  function stringToCharCodes(str) {
    return Array.from(str).map(c => c.charCodeAt(0));
  }
  function xorArrays(arr1, arr2) {
    const length = Math.min(arr1.length, arr2.length);
    let result = [];
    for(let i = 0; i < length; i++) {
      result.push(arr1[i] ^ arr2[i]);
    }
    return result;
  }
  function rotateArray(arr, positions) {
    const len = arr.length;
    positions = positions % len;
    return arr.slice(positions).concat(arr.slice(0, positions));
  }
  function arrayToHex(arr) {
    return arr.map(n => n.toString(16).padStart(2, '0')).join('');
  }
  function simpleHash(arr) {
    return arr.reduce((acc, val) => (acc + val) % 256, 0);
  }

  const arr1 = stringToCharCodes(key1);
  const arr2 = stringToCharCodes(key2);

  let xored = xorArrays(arr1, arr2);
  const rotateBy = (arr1.reduce((a,b) => a+b,0) + arr2.reduce((a,b) => a+b,0)) % xored.length;
  xored = rotateArray(xored, rotateBy);
  const checksum = simpleHash(xored);
  xored.push(checksum);

  return arrayToHex(xored);
}

module.exports = { randomKey, buildComplexToken };

