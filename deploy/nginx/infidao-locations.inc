# Include only in the HTTPS aitoshuu.me server block after the loopback app is healthy.
# This file must not end in .conf inside BaoTa's auto-included vhost directory.
# proxy_pass has no URI suffix, so Next receives the original route and query string.
location = /infidao {
    proxy_pass http://127.0.0.1:3109;
    # BaoTa enables proxy_cache globally; never cache the release entry page.
    proxy_cache off;
    proxy_hide_header Cache-Control;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_redirect off;
    set $fv_cache_control "no-cache";
}

location ^~ /infidao/ {
    proxy_pass http://127.0.0.1:3109;
    proxy_cache off;
    proxy_hide_header Cache-Control;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_redirect off;
    set $fv_cache_control "no-cache";
}

location ^~ /_next/static/ {
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
    proxy_cache off;
    proxy_hide_header Cache-Control;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_redirect off;
    set $fv_cache_control "public, max-age=31536000, immutable";
}

# Named locations cannot be requested directly. Missing compressed files return
# through Next using the original URI, without a misleading Content-Encoding.
location @infidao_brotli_js {
    root /opt/infidao-current/app;
    rewrite ^/_next/(.*)$ /.next/$1 break;
    try_files $uri.br @infidao_static_uncompressed;
    types { }
    default_type application/javascript;
    gzip off;
    add_header Content-Encoding br;
    add_header Vary Accept-Encoding;
    add_header Cache-Control "public, max-age=31536000, immutable";
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
}

location @infidao_brotli_css {
    root /opt/infidao-current/app;
    rewrite ^/_next/(.*)$ /.next/$1 break;
    try_files $uri.br @infidao_static_uncompressed;
    types { }
    default_type text/css;
    gzip off;
    add_header Content-Encoding br;
    add_header Vary Accept-Encoding;
    add_header Cache-Control "public, max-age=31536000, immutable";
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
}

location @infidao_static_uncompressed {
    proxy_pass http://127.0.0.1:3109$request_uri;
    proxy_cache off;
    proxy_hide_header Cache-Control;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_redirect off;
    set $fv_cache_control "public, max-age=31536000, immutable";
}

location ^~ /_next/ {
    proxy_pass http://127.0.0.1:3109;
    proxy_cache off;
    proxy_hide_header Cache-Control;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_redirect off;
    set $fv_cache_control "no-cache";
}

location ^~ /flow-assets/ {
    proxy_pass http://127.0.0.1:3109;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_redirect off;
    set $fv_cache_control "public, max-age=31536000, immutable";
}

location ^~ /flow-releases/ {
    proxy_pass http://127.0.0.1:3109;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_redirect off;
    set $fv_cache_control "public, max-age=31536000, immutable";
}

location = /api/flow {
    proxy_pass http://127.0.0.1:3109;
    proxy_http_version 1.1;
    proxy_pass_header X-Accel-Buffering;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_cache off;
    gzip off;
    proxy_read_timeout 240s;
    proxy_send_timeout 240s;
    set $fv_cache_control "no-store";
}

location ^~ /api/flow/ {
    proxy_pass http://127.0.0.1:3109;
    proxy_http_version 1.1;
    proxy_pass_header X-Accel-Buffering;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_cache off;
    gzip off;
    proxy_read_timeout 240s;
    proxy_send_timeout 240s;
    set $fv_cache_control "no-store";
}
