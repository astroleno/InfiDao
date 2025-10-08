"use client";
import React from 'react';
import AppClone from "../web/iw-clone/App";

export default function HomePage() {
  try {
    return <AppClone />;
  } catch (e) {
    console.error("Failed to render iw-clone App on Next page", e);
    return (
      <main style={{ padding: 24 }}>
        <h1>六经注我（简约版）</h1>
        <p>前端加载异常，请刷新或稍后重试。</p>
      </main>
    );
  }
}
