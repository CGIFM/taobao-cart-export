document.getElementById('open').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://cart.taobao.com/' });
});
