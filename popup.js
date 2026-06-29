document.getElementById('openCart').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://cart.taobao.com/' });
});
document.getElementById('openOrders').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm' });
});
