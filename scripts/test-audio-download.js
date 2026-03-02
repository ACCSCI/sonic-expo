const DEFAULT_QN = '80';
const RANGE_BYTES = 1024 * 1024;

function getArg(name) {
  const prefix = `${name}=`;
  const arg = process.argv.find(value => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function printUsage() {
  console.log('Usage:');
  console.log('  node scripts/test-audio-download.js --bvid=BVxxxx --cid=123');
  console.log('  node scripts/test-audio-download.js --url=https://...');
  console.log('Options:');
  console.log('  --qn=80        Quality (default 80)');
  console.log('  --full         Download full file (no Range)');
}

async function getAudioUrls(bvid, cid, qn) {
  const apiUrl = `https://api.bilibili.com/x/player/playurl?cid=${cid}&bvid=${bvid}&qn=${qn}&fnval=16`;
  const response = await fetch(apiUrl, {
    headers: {
      Referer: 'https://www.bilibili.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Playurl HTTP error: ${response.status}`);
  }

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`Playurl API error: ${data.message || data.code}`);
  }

  const dashAudio = data.data?.dash?.audio || [];
  if (dashAudio.length > 0) {
    const sorted = dashAudio.slice().sort((a, b) => b.id - a.id);
    const urls = [];
    for (const audio of sorted) {
      if (audio.baseUrl || audio.base_url) {
        urls.push(audio.baseUrl || audio.base_url);
      }
      if (Array.isArray(audio.backupUrl)) {
        urls.push(...audio.backupUrl);
      } else if (Array.isArray(audio.backup_url)) {
        urls.push(...audio.backup_url);
      }
    }
    return Array.from(new Set(urls));
  }

  const durl = data.data?.durl || [];
  if (durl.length > 0) {
    return durl.map(item => item.url).filter(Boolean);
  }

  return [];
}

async function testDownload(url, full) {
  const headers = {
    Referer: 'https://www.bilibili.com',
    Origin: 'https://www.bilibili.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Accept: '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Connection: 'keep-alive',
  };

  if (!full) {
    headers.Range = `bytes=0-${RANGE_BYTES - 1}`;
  }

  const response = await fetch(url, { headers });
  const lengthHeader = response.headers.get('content-length');
  const rangeHeader = response.headers.get('content-range');

  if (!response.ok && response.status !== 206) {
    throw new Error(`Download HTTP error: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  return {
    status: response.status,
    bytes: buffer.byteLength,
    contentLength: lengthHeader,
    contentRange: rangeHeader,
  };
}

async function main() {
  const urlArg = getArg('--url');
  const bvid = getArg('--bvid');
  const cid = getArg('--cid');
  const qn = getArg('--qn') || DEFAULT_QN;
  const full = hasFlag('--full');

  if (!urlArg && (!bvid || !cid)) {
    printUsage();
    process.exit(1);
  }

  let urls = [];
  if (urlArg) {
    urls = [urlArg];
  } else {
    console.log('Playurl params:', { bvid, cid, qn });
    urls = await getAudioUrls(bvid, cid, qn);
  }

  if (urls.length === 0) {
    console.log('No audio URLs found.');
    process.exit(1);
  }

  console.log(`Found ${urls.length} URL(s).`);
  for (const [index, url] of urls.entries()) {
    console.log(`\n[${index + 1}/${urls.length}] ${url}`);
    try {
      const result = await testDownload(url, full);
      console.log('Status:', result.status);
      console.log('Bytes:', result.bytes);
      if (result.contentLength) {
        console.log('Content-Length:', result.contentLength);
      }
      if (result.contentRange) {
        console.log('Content-Range:', result.contentRange);
      }
    } catch (error) {
      console.log('Download failed:', error instanceof Error ? error.message : error);
    }
  }
}

main().catch(error => {
  console.error('Script failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
