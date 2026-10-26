import { publicReaderOrigin } from '@/lib/flow-browser/public-route';

test.each(['tongye.me', 'TONGYE.ME', 'www.tongye.me', 'tongye.me:443'])(
  'metadata keeps the tongye origin for %s', host => {
    expect(publicReaderOrigin(host)).toBe('https://tongye.me');
  },
);

test.each(['aitoshuu.me', 'www.aitoshuu.me', null, 'untrusted.example', 'tongye.me.attacker.example'])(
  'metadata uses a known origin for %s', host => {
    expect(publicReaderOrigin(host)).toBe('https://aitoshuu.me');
  },
);
