// 简易本地 Mock API（端口 3001）：/api/search 与 /api/annotate
// - /api/annotate 返回 ReadableStream 按行 JSON：chunk/meta/end
import http from 'http';

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/search') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(
          JSON.stringify({
            results: [
              {
                text: '克己复礼为仁。一日克己复礼，天下归仁焉。',
                source: '论语',
                chapter: '颜渊篇',
                score: 0.87,
                metadata: { id: 'LJ_015', section: 1 },
              },
            ],
          }),
        );
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/annotate') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        Connection: 'keep-alive',
      });

      const writeLine = (obj) => res.write(JSON.stringify(obj) + '\n');
      writeLine({ type: 'chunk', data: { six_to_me: '【六经注我】自律之道，在于克己复礼；' } });
      setTimeout(() => writeLine({ type: 'chunk', data: { me_to_six: '【我注六经】现代自律，是对秩序的主动选择。' } }), 300);
      setTimeout(() => writeLine({ type: 'meta', data: { reason: 'semantic', links: [{ to_id: 'LJ_041', score: 0.62 }] } }), 600);
      setTimeout(() => { writeLine({ type: 'end' }); res.end(); }, 900);
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  } catch (e) {
    res.writeHead(500);
    res.end('Server Error');
  }
});

server.listen(3001, () => console.log('Mock API listening on http://localhost:3001'));


