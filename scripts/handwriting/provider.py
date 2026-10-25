"""Inko adapter: zero cost is a hard limit, never an inferred default."""
from __future__ import annotations

import ipaddress
import json
import socket
import urllib.error
import urllib.parse
import urllib.request

BASE = 'https://api.inkotype.com/v1'


class ProviderError(Exception):
    def __init__(self, code, message, retry=False, positions=None):
        self.code, self.message, self.retry, self.positions = code, message, retry, positions
        super().__init__(code)


def zero_price(value):
    price = value.get('price')
    amount = price.get('list_cents') if isinstance(price, dict) else None
    if type(amount) not in (int, float) or amount != 0:
        raise ProviderError('NONZERO_OR_UNKNOWN_PRICE', '报价不是明确的零费用，已停止制作。')
    for field in ('cost_cents', 'cost_cny'):
        if field in value and (type(value[field]) not in (int, float) or value[field] != 0):
            raise ProviderError('NONZERO_OR_UNKNOWN_PRICE', '实际报价变化，已停止制作。')


def layout_for(content):
    marks = []
    for i, block in enumerate(content['blocks']):
        scale = 0.7 if block['role'] in ('source', 'date', 'signature') else 1.0
        marks.append({'id': f'part-{i}', 'start': block['start'], 'end': block['end'], 'f': {'scale': scale, 'indent': 0}})
    return {'text': content['text'], 'paperId': 'blank', 'd': {
        'size': 7 if content['layout'] == 'cream' else 6.5, 'line': 1.8, 'letter': 0,
        'align': 'left', 'indent': 0, 'margins': [30, 22, 42, 22], 'autoFlow': True, 'fillRest': True,
        'style': content['styleCode'], 'pen': 'original|black|0|0',
    }, 'marks': marks}


class Inko:
    def __init__(self, key):
        self.key = key

    def call(self, method, route, body=None, idempotency=None):
        headers = {'Authorization': f'Bearer {self.key}', 'Content-Type': 'application/json'}
        if idempotency:
            headers['Idempotency-Key'] = idempotency
        req = urllib.request.Request(BASE + route, data=json.dumps(body, ensure_ascii=False).encode() if body is not None else None,
                                     headers=headers, method=method)
        try:
            with urllib.request.build_opener(NoRedirect).open(req, timeout=30) as response:
                raw = response.read(4_000_001)
                if len(raw) > 4_000_000:
                    raise ProviderError('UPSTREAM_CHANGED', '手写服务返回内容异常，已停止制作。')
                return json.loads(raw)
        except urllib.error.HTTPError as error:
            raise ProviderError('UPSTREAM_ERROR', '手写服务暂不可用，正在核对原任务。' if error.code >= 500 or error.code == 429 else '手写服务拒绝了这次制作，请检查字迹与文字。',
                                retry=error.code >= 500 or error.code == 429) from None
        except (urllib.error.URLError, TimeoutError, OSError, ValueError):
            raise ProviderError('UPSTREAM_UNAVAILABLE', '网络暂不稳定，正在核对原任务。', retry=True) from None

    def preflight(self, content):
        text, style = content['text'], content['styleCode']
        quote = self.call('POST', '/quote', {'text': text, 'model': 'lyric-1', 'size': 'medium', 'style': style})
        zero_price(quote)
        if quote.get('ok') is not True or quote.get('errors'):
            positions = []
            for error in quote.get('errors') or []:
                symbol = error.get('symbol')
                if isinstance(symbol, str) and symbol:
                    start = 0
                    while (pos := text.find(symbol, start)) >= 0:
                        positions.append({'symbol': symbol, 'position': len(text[:pos].encode('utf-16-le')) // 2})
                        start = pos + len(symbol)
            raise ProviderError('UNWRITABLE_TEXT', '预览中有无法书写的字符，请查看标记并调整所选内容；原文没有被替换。', positions=positions)
        resolved = quote.get('style') or {}
        if str(resolved.get('ref', '')) != style:
            raise ProviderError('STYLE_UNAVAILABLE', '所选字迹已不可用，请重新选择；不会自动换用其他字迹。')
        layout = layout_for(content)
        plan = self.call('POST', '/layout', {'model': 'lyric-1', 'layout': layout})
        zero_price(plan)
        if type(plan.get('unplaced')) is not int or plan['unplaced'] != 0:
            raise ProviderError('LAYOUT_OVERFLOW', '仍有文字未排入，请调整版式或减少所选内容。')
        if type(plan.get('pages')) is not int or not 1 <= plan['pages'] <= 60:
            raise ProviderError('TOO_MANY_PAGES', '排版页数超出范围，请减少所选内容。')
        return {'model': 'lyric-1', 'style': style, 'layout': layout, 'label': 'visible', 'scene': True, 'pen': content['pen']}, plan


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


def checked_url(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ProviderError('UNSAFE_ASSET', '素材地址异常，已停止下载。')
    # This exact TLS origin is already trusted for authenticated API calls. Local
    # network proxies can resolve it to benchmark-range fake IPs; retain hostname
    # and certificate verification rather than rejecting that transport mapping.
    if parsed.hostname == 'api.inkotype.com':
        return url
    try:
        addresses = socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)
    except OSError:
        raise ProviderError('DOWNLOAD_UNAVAILABLE', '素材暂不可取回，稍后继续整理。', retry=True) from None
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise ProviderError('UNSAFE_ASSET', '素材地址异常，已停止下载。')
    return url


def download(url, path, limit=100 * 1024 * 1024):
    # Signed provider links carry no API key. Recheck every redirect; private network targets are rejected.
    opener = urllib.request.build_opener(NoRedirect)
    try:
        for _ in range(4):
            checked_url(url)
            try:
                response = opener.open(urllib.request.Request(url, headers={'User-Agent': 'InfiDao-Keepsake/1'}), timeout=40)
                break
            except urllib.error.HTTPError as error:
                if error.code in (301, 302, 303, 307, 308) and error.headers.get('Location'):
                    url = urllib.parse.urljoin(url, error.headers['Location'])
                    continue
                raise
        else:
            raise ProviderError('UNSAFE_ASSET', '素材重定向异常。')
        with response, path.with_suffix(path.suffix + '.part').open('wb') as out:
            count = 0
            while chunk := response.read(1024 * 1024):
                count += len(chunk)
                if count > limit:
                    raise ProviderError('ASSET_TOO_LARGE', '素材超过可处理的大小，已停止下载。')
                out.write(chunk)
        path.with_suffix(path.suffix + '.part').replace(path)
    except ProviderError:
        raise
    except (urllib.error.URLError, TimeoutError, OSError):
        raise ProviderError('DOWNLOAD_UNAVAILABLE', '素材暂不可取回，稍后继续整理。', retry=True) from None
