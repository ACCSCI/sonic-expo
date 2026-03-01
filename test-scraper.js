const { scrapeFromUrl, scrapeVideoInfo } = require('./src/services/scraper');

async function test() {
  console.log('=== 测试 scrapeFromUrl ===');
  const result1 = await scrapeFromUrl('https://www.bilibili.com/video/BV1Sg411w7T9');
  console.log('结果:', JSON.stringify(result1, null, 2));
  
  console.log('\n=== 测试 scrapeVideoInfo ===');
  const result2 = await scrapeVideoInfo('BV1Sg411w7T9');
  console.log('结果:', JSON.stringify(result2, null, 2));
}

test().catch(console.error);