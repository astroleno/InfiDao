# Include in Tencent's aitoshuu.art HTTPS server through its extension directory.
# Requires tencent-public-host-map.conf in the http context. Only Ali and loopback
# may supply one of the two approved public hosts; Node/Redis stay on loopback.
# Keep this snippet outside BaoTa's auto-included top-level vhost directory.
# proxy_pass has no URI suffix, so Next receives the original route and query string.
# Exact and ^~ locations below serve the canonical prefix; all other casing is
# redirected within the same site without changing suffix casing or parameters.
location ~* ^/InfiDao(?<infidao_public_suffix>/.*)?$ {
    allow 47.103.120.24;
    allow 127.0.0.1;
    deny all;
    if ($nine_public_host = "") { return 403; }
    return 308 /InfiDao$infidao_public_suffix$is_args$args;
}

location = /InfiDao {
    allow 47.103.120.24;
    allow 127.0.0.1;
    deny all;
    if ($nine_public_host = "") { return 403; }
    proxy_pass http://127.0.0.1:3109;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_cache off;
    proxy_hide_header Cache-Control;
    proxy_set_header Host $nine_public_host;
    proxy_set_header X-Forwarded-Host $nine_public_host;
    proxy_set_header X-Real-IP $http_x_real_ip;
    proxy_set_header X-Forwarded-For $http_x_real_ip;
    proxy_set_header X-Forwarded-Proto https;
    proxy_redirect off;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header X-Project-Origin tencent-shanghai always;
    add_header Cache-Control "no-cache" always;
}

location ^~ /InfiDao/ {
    allow 47.103.120.24;
    allow 127.0.0.1;
    deny all;
    if ($nine_public_host = "") { return 403; }
    proxy_pass http://127.0.0.1:3109;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_cache off;
    proxy_hide_header Cache-Control;
    proxy_set_header Host $nine_public_host;
    proxy_set_header X-Forwarded-Host $nine_public_host;
    proxy_set_header X-Real-IP $http_x_real_ip;
    proxy_set_header X-Forwarded-For $http_x_real_ip;
    proxy_set_header X-Forwarded-Proto https;
    proxy_redirect off;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header X-Project-Origin tencent-shanghai always;
    add_header Cache-Control "no-cache" always;
}

location ^~ /_next/static/ {
    allow 47.103.120.24;
    allow 127.0.0.1;
    deny all;
    if ($nine_public_host = "") { return 403; }
    # Only explicit, nonzero br support opts in; q=0 and wildcard fall back.
    set $infidao_encoding "";
    if ($http_accept_encoding ~* "(?:^|,)\s*br\s*(?:;\s*q=(?:1(?:\.0{1,3})?|0\.(?:[1-9][0-9]{0,2}|0[1-9][0-9]?|00[1-9])))?\s*(?:,|$)") {
        set $infidao_encoding br;
    }
    if ($uri ~ "\.js$") { set $infidao_encoding "${infidao_encoding}js"; }
    if ($uri ~ "\.css$") { set $infidao_encoding "${infidao_encoding}css"; }
    error_page 418 = @infidao_brotli_js;
    error_page 419 = @infidao_brotli_css;
    if ($infidao_encoding = brjs) { return 418; }
    if ($infidao_encoding = brcss) { return 419; }
    proxy_pass http://127.0.0.1:3109;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_cache off;
    proxy_hide_header Cache-Control;
    proxy_set_header Host $nine_public_host;
    proxy_set_header X-Forwarded-Host $nine_public_host;
    proxy_set_header X-Real-IP $http_x_real_ip;
    proxy_set_header X-Forwarded-For $http_x_real_ip;
    proxy_set_header X-Forwarded-Proto https;
    proxy_redirect off;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header X-Project-Origin tencent-shanghai always;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
}

# Named locations cannot be requested directly. Missing compressed files return
# through Next using the original URI, without a misleading Content-Encoding.
location @infidao_brotli_js {
    allow 47.103.120.24;
    allow 127.0.0.1;
    deny all;
    if ($nine_public_host = "") { return 403; }
    root /opt/infidao-current/app;
    rewrite ^/_next/(.*)$ /.next/$1 break;
    try_files $uri.br @infidao_static_uncompressed;
    types { }
    default_type application/javascript;
    gzip off;
    add_header Content-Encoding br;
    add_header Vary Accept-Encoding;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header X-Project-Origin tencent-shanghai always;
    add_header Cache-Control "public, max-age=31536000, immutable";
}

location @infidao_brotli_css {
    allow 47.103.120.24;
    allow 127.0.0.1;
    deny all;
    if ($nine_public_host = "") { return 403; }
    root /opt/infidao-current/app;
    rewrite ^/_next/(.*)$ /.next/$1 break;
    try_files $uri.br @infidao_static_uncompressed;
    types { }
    default_type text/css;
    gzip off;
    add_header Content-Encoding br;
    add_header Vary Accept-Encoding;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header X-Project-Origin tencent-shanghai always;
    add_header Cache-Control "public, max-age=31536000, immutable";
}

location @infidao_static_uncompressed {
    allow 47.103.120.24;
    allow 127.0.0.1;
    deny all;
    if ($nine_public_host = "") { return 403; }
    proxy_pass http://127.0.0.1:3109$request_uri;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_cache off;
    proxy_hide_header Cache-Control;
    proxy_set_header Host $nine_public_host;
    proxy_set_header X-Forwarded-Host $nine_public_host;
    proxy_set_header X-Real-IP $http_x_real_ip;
    proxy_set_header X-Forwarded-For $http_x_real_ip;
    proxy_set_header X-Forwarded-Proto https;
    proxy_redirect off;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header X-Project-Origin tencent-shanghai always;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
}

location ^~ /_next/ {
    allow 47.103.120.24;
    allow 127.0.0.1;
    deny all;
    if ($nine_public_host = "") { return 403; }
    proxy_pass http://127.0.0.1:3109;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_cache off;
    proxy_hide_header Cache-Control;
    proxy_set_header Host $nine_public_host;
    proxy_set_header X-Forwarded-Host $nine_public_host;
    proxy_set_header X-Real-IP $http_x_real_ip;
    proxy_set_header X-Forwarded-For $http_x_real_ip;
    proxy_set_header X-Forwarded-Proto https;
    proxy_redirect off;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header X-Project-Origin tencent-shanghai always;
    add_header Cache-Control "no-cache" always;
}

location ^~ /flow-assets/ {
    allow 47.103.120.24;
    allow 127.0.0.1;
    deny all;
    if ($nine_public_host = "") { return 403; }
    proxy_pass http://127.0.0.1:3109;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $nine_public_host;
    proxy_set_header X-Forwarded-Host $nine_public_host;
    proxy_set_header X-Real-IP $http_x_real_ip;
    proxy_set_header X-Forwarded-For $http_x_real_ip;
    proxy_set_header X-Forwarded-Proto https;
    proxy_redirect off;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header X-Project-Origin tencent-shanghai always;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
}

location ^~ /flow-releases/ {
    allow 47.103.120.24;
    allow 127.0.0.1;
    deny all;
    if ($nine_public_host = "") { return 403; }
    proxy_pass http://127.0.0.1:3109;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $nine_public_host;
    proxy_set_header X-Forwarded-Host $nine_public_host;
    proxy_set_header X-Real-IP $http_x_real_ip;
    proxy_set_header X-Forwarded-For $http_x_real_ip;
    proxy_set_header X-Forwarded-Proto https;
    proxy_redirect off;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header X-Project-Origin tencent-shanghai always;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
}

location = /api/flow {
    allow 47.103.120.24;
    allow 127.0.0.1;
    deny all;
    if ($nine_public_host = "") { return 403; }
    proxy_pass http://127.0.0.1:3109;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_pass_header X-Accel-Buffering;
    proxy_set_header Host $nine_public_host;
    proxy_set_header X-Forwarded-Host $nine_public_host;
    proxy_set_header X-Real-IP $http_x_real_ip;
    proxy_set_header X-Forwarded-For $http_x_real_ip;
    proxy_set_header X-Forwarded-Proto https;
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_cache off;
    gzip off;
    proxy_read_timeout 240s;
    proxy_send_timeout 240s;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header X-Project-Origin tencent-shanghai always;
    add_header Cache-Control "no-store" always;
}

location ^~ /api/handwriting/ {
    allow 47.103.120.24;
    allow 127.0.0.1;
    deny all;
    if ($nine_public_host = "") { return 403; }
    proxy_pass http://127.0.0.1:3109;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $nine_public_host;
    proxy_set_header X-Forwarded-Host $nine_public_host;
    proxy_set_header X-Real-IP $http_x_real_ip;
    proxy_set_header X-Forwarded-For $http_x_real_ip;
    proxy_set_header X-Forwarded-Proto https;
    proxy_cache off;
    proxy_buffering off;
    proxy_read_timeout 60s;
    proxy_redirect off;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header X-Project-Origin tencent-shanghai always;
    add_header Cache-Control "no-store" always;
}

location ^~ /api/flow/ {
    allow 47.103.120.24;
    allow 127.0.0.1;
    deny all;
    if ($nine_public_host = "") { return 403; }
    proxy_pass http://127.0.0.1:3109;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_pass_header X-Accel-Buffering;
    proxy_set_header Host $nine_public_host;
    proxy_set_header X-Forwarded-Host $nine_public_host;
    proxy_set_header X-Real-IP $http_x_real_ip;
    proxy_set_header X-Forwarded-For $http_x_real_ip;
    proxy_set_header X-Forwarded-Proto https;
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_cache off;
    gzip off;
    proxy_read_timeout 240s;
    proxy_send_timeout 240s;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header X-Project-Origin tencent-shanghai always;
    add_header Cache-Control "no-store" always;
}
