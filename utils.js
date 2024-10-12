export const wait = (time) => new Promise((resolve) => setTimeout(resolve, time));

export const formatPrice = (price) => {
  if (price === 'Unknown') return 'Unknown';
  const priceNum = parseFloat(price);
  if (priceNum === 0) return '0';
  const decimalPlaces = Math.max(2, -Math.floor(Math.log10(priceNum)) + 2);
  return priceNum.toFixed(decimalPlaces);
};

export const makeClickableCode = (text) => `<code>${text}</code>`;