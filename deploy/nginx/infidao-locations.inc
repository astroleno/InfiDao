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
