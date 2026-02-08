import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const LOGS_DIR = path.join(os.homedir(), ".openclaw", "logs");
const PAYLOAD_LOG = path.join(LOGS_DIR, "anthropic-payload.jsonl");
const RAW_STREAM_LOG = path.join(LOGS_DIR, "raw-stream.jsonl");

function sendJson(res: ServerResponse, data: unknown) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(JSON.stringify(data, null, 2));
}

function sendHtml(res: ServerResponse, html: string) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
}

function readLastLines(filePath: string, maxLines: number = 100): string[] {
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

function parseLogLines(lines: string[]): any[] {
  return lines.map((line, index) => {
    try {
      return { index, ...JSON.parse(line) };
    } catch {
      return { index, raw: line, parseError: true };
    }
  }).reverse(); // Most recent first
}

const VIEWER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenClaw - LLM Payload Logs</title>
  <style>
    :root {
      --bg: #1a1a2e;
      --surface: #16213e;
      --border: #0f3460;
      --text: #e8e8e8;
      --text-muted: #a0a0a0;
      --accent: #e94560;
      --success: #4caf50;
      --warning: #ff9800;
      --sidebar-width: 280px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 0.75rem 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    h1 { font-size: 1.1rem; font-weight: 500; }
    h1 span { color: var(--accent); }
    .controls { display: flex; gap: 0.75rem; align-items: center; }
    button {
      background: var(--border);
      color: var(--text);
      border: none;
      padding: 0.4rem 0.75rem;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.8rem;
    }
    button:hover { background: var(--accent); }
    button.active { background: var(--accent); }
    select {
      background: var(--border);
      color: var(--text);
      border: none;
      padding: 0.4rem 0.5rem;
      border-radius: 4px;
      font-size: 0.8rem;
    }
    .layout {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    .sidebar {
      width: var(--sidebar-width);
      background: var(--surface);
      border-right: 1px solid var(--border);
      overflow-y: auto;
      flex-shrink: 0;
    }
    .sidebar-header {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border);
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
      position: sticky;
      top: 0;
      background: var(--surface);
      z-index: 10;
    }
    .session-group {
      border-bottom: 1px solid var(--border);
    }
    .session-header {
      padding: 0.6rem 1rem;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.8rem;
      transition: background 0.15s;
    }
    .session-header:hover { background: var(--border); }
    .session-header.selected { background: var(--accent); color: #fff; }
    .session-info { flex: 1; min-width: 0; }
    .session-name {
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .session-meta {
      font-size: 0.7rem;
      color: var(--text-muted);
      margin-top: 2px;
    }
    .session-header.selected .session-meta { color: rgba(255,255,255,0.7); }
    .session-count {
      background: var(--border);
      padding: 0.15rem 0.5rem;
      border-radius: 10px;
      font-size: 0.7rem;
      margin-left: 0.5rem;
      flex-shrink: 0;
    }
    .session-header.selected .session-count { background: rgba(255,255,255,0.2); }
    .run-list {
      display: none;
      background: var(--bg);
    }
    .run-list.expanded { display: block; }
    .run-item {
      padding: 0.5rem 1rem 0.5rem 1.5rem;
      cursor: pointer;
      font-size: 0.75rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .run-item:hover { background: var(--surface); }
    .run-item.selected { background: var(--border); color: var(--accent); }
    .run-time { color: var(--text-muted); font-size: 0.7rem; }
    .main-content {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
    }
    .stats {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-bottom: 1rem;
      padding: 0.5rem 0;
      border-bottom: 1px solid var(--border);
    }
    .log-entry {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      margin-bottom: 0.75rem;
      overflow: hidden;
    }
    .log-header {
      padding: 0.6rem 1rem;
      background: var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      font-size: 0.8rem;
    }
    .log-header:hover { background: #1a4080; }
    .log-meta { display: flex; gap: 0.75rem; font-size: 0.7rem; color: var(--text-muted); align-items: center; }
    .log-stage {
      padding: 0.2rem 0.4rem;
      border-radius: 3px;
      font-size: 0.7rem;
      font-weight: 500;
    }
    .stage-request { background: var(--warning); color: #000; }
    .stage-usage { background: var(--success); color: #fff; }
    .log-body {
      padding: 1rem;
      display: none;
      max-height: 500px;
      overflow: auto;
    }
    .log-body.expanded { display: block; }
    pre {
      background: var(--bg);
      padding: 0.75rem;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 0.75rem;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .empty-state {
      text-align: center;
      padding: 3rem;
      color: var(--text-muted);
    }
    .loading { animation: pulse 1s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .payload-section { margin-top: 0.6rem; }
    .payload-section h4 {
      font-size: 0.7rem;
      color: var(--accent);
      margin-bottom: 0.4rem;
      text-transform: uppercase;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.2rem;
    }
    .message { margin: 0.5rem 0; padding: 0.6rem; background: var(--bg); border-radius: 4px; border-left: 3px solid var(--border); }
    .message-role {
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      margin-bottom: 0.4rem;
      padding: 0.1rem 0.35rem;
      border-radius: 3px;
      display: inline-block;
    }
    .role-user { color: #fff; background: #2196f3; }
    .role-assistant { color: #fff; background: #4caf50; }
    .role-system { color: #fff; background: #ff9800; }
    .role-tool { color: #fff; background: #9c27b0; }
    .message-content {
      font-size: 0.8rem;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .system-prompt {
      font-size: 0.8rem;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 300px;
      overflow: auto;
    }
    .all-sessions { cursor: pointer; padding: 0.6rem 1rem; font-size: 0.8rem; border-bottom: 1px solid var(--border); }
    .all-sessions:hover { background: var(--border); }
    .all-sessions.selected { background: var(--accent); color: #fff; }
    /* Message history styles */
    .message-group { margin: 0.5rem 0; }
    .message-group-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.6rem;
      background: var(--border);
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    .message-group-header:hover { background: #1a4080; color: var(--text); }
    .message-group-header .arrow { transition: transform 0.2s; }
    .message-group-header.expanded .arrow { transform: rotate(90deg); }
    .message-group-content { display: none; padding-left: 0.5rem; border-left: 2px solid var(--border); margin-left: 0.5rem; }
    .message-group-content.expanded { display: block; }
    .message.history { opacity: 0.7; border-left-color: var(--text-muted); }
    .message.current { border-left-color: var(--accent); background: rgba(233, 69, 96, 0.1); }
    .message-badge {
      font-size: 0.6rem;
      padding: 0.1rem 0.3rem;
      border-radius: 3px;
      margin-left: 0.5rem;
      font-weight: normal;
    }
    .badge-new { background: var(--accent); color: #fff; }
    .badge-history { background: var(--text-muted); color: var(--bg); }
  </style>
</head>
<body>
  <header>
    <h1><span>OpenClaw</span> LLM Payload Logs</h1>
    <div class="controls">
      <select id="logType">
        <option value="payload">Anthropic Payload</option>
        <option value="raw">Raw Stream</option>
      </select>
      <select id="limit">
        <option value="50">Last 50</option>
        <option value="100" selected>Last 100</option>
        <option value="200">Last 200</option>
        <option value="500">Last 500</option>
      </select>
      <button onclick="refresh()">↻ Refresh</button>
      <button onclick="toggleAutoRefresh()" id="autoBtn">Auto: Off</button>
      <button onclick="clearLogs()" style="background:#c62828">🗑 Clear</button>
    </div>
  </header>
  <div class="layout">
    <div class="sidebar">
      <div class="sidebar-header">Sessions</div>
      <div id="sessionList"></div>
    </div>
    <div class="main-content">
      <div class="stats" id="stats">Loading...</div>
      <div id="logs"></div>
    </div>
  </div>
  <script>
    let autoRefresh = null;
    let expandedEntries = new Set();
    let expandedSessions = new Set();
    let allEntries = [];
    let selectedSession = null;
    let selectedRun = null;

    async function fetchLogs() {
      const type = document.getElementById('logType').value;
      const limit = document.getElementById('limit').value;
      const res = await fetch('/logs/api?type=' + type + '&limit=' + limit);
      return res.json();
    }

    function formatTimestamp(ts) {
      if (!ts) return '-';
      try {
        return new Date(ts).toLocaleString();
      } catch {
        return ts;
      }
    }

    function formatTime(ts) {
      if (!ts) return '-';
      try {
        return new Date(ts).toLocaleTimeString();
      } catch {
        return ts;
      }
    }

    function formatContent(text) {
      if (!text) return '';
      return text
        .replace(/\\\\n/g, '\\n')
        .replace(/\\\\t/g, '\\t')
        .replace(/\\\\r/g, '');
    }

    function extractSystemText(system) {
      if (!system) return '';
      if (typeof system === 'string') return formatContent(system);
      if (Array.isArray(system)) {
        return system.map(item => {
          if (typeof item === 'string') return formatContent(item);
          if (item && item.type === 'text' && item.text) return formatContent(item.text);
          return JSON.stringify(item, null, 2);
        }).join('\\n\\n');
      }
      return JSON.stringify(system, null, 2);
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function formatMessageContent(msg) {
      let content = '';
      if (typeof msg.content === 'string') {
        content = formatContent(msg.content);
        if (content.length > 2000) content = content.slice(0, 2000) + '\\n\\n... [truncated]';
      } else if (Array.isArray(msg.content)) {
        content = msg.content.map(c => {
          if (c.type === 'text') return formatContent(c.text || '');
          if (c.type === 'thinking') return '[Thinking]\\n' + formatContent(c.thinking || '');
          if (c.type === 'tool_use') return '[Tool Call: ' + c.name + ']';
          if (c.type === 'tool_result') {
            if (typeof c.content === 'string') return '[Tool Result]\\n' + formatContent(c.content);
            return '[Tool Result]';
          }
          return JSON.stringify(c, null, 2);
        }).join('\\n\\n');
        if (content.length > 2000) content = content.slice(0, 2000) + '\\n\\n... [truncated]';
      }
      return content;
    }

    function renderSingleMessage(msg, idx, isHistory, isCurrent) {
      const role = msg.role || 'unknown';
      const content = formatMessageContent(msg);
      const msgClass = isCurrent ? 'current' : (isHistory ? 'history' : '');
      const badge = isCurrent ? '<span class="message-badge badge-new">NEW</span>' : '';
      return '<div class="message ' + msgClass + '">' +
        '<div class="message-role role-' + role + '">' + role + ' #' + (idx + 1) + badge + '</div>' +
        '<div class="message-content">' + escapeHtml(content) + '</div>' +
      '</div>';
    }

    let messageGroupCounter = 0;

    function renderMessages(messages) {
      if (!messages || !Array.isArray(messages)) return '';

      // Find the last user message index - this is the "current turn"
      let lastUserIdx = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          lastUserIdx = i;
          break;
        }
      }

      // If only 1-2 messages or no user found, show all without grouping
      if (messages.length <= 2 || lastUserIdx <= 0) {
        return messages.map((msg, idx) => renderSingleMessage(msg, idx, false, idx >= lastUserIdx && lastUserIdx >= 0)).join('');
      }

      // Split into history (before last user) and current (last user + after)
      const historyMessages = messages.slice(0, lastUserIdx);
      const currentMessages = messages.slice(lastUserIdx);

      messageGroupCounter++;
      const groupId = 'msg-group-' + messageGroupCounter;

      let html = '';

      // History section (collapsed by default)
      if (historyMessages.length > 0) {
        html += '<div class="message-group">';
        html += '<div class="message-group-header" onclick="toggleMessageGroup(\\'' + groupId + '\\')">';
        html += '<span class="arrow">▶</span>';
        html += '<span>📜 History Context (' + historyMessages.length + ' messages)</span>';
        html += '<span class="message-badge badge-history">click to expand</span>';
        html += '</div>';
        html += '<div class="message-group-content" id="' + groupId + '">';
        html += historyMessages.map((msg, idx) => renderSingleMessage(msg, idx, true, false)).join('');
        html += '</div>';
        html += '</div>';
      }

      // Current section (always visible)
      html += '<div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed var(--accent);">';
      html += '<div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 0.4rem; font-weight: 500;">💬 Current Turn</div>';
      html += currentMessages.map((msg, idx) => renderSingleMessage(msg, lastUserIdx + idx, false, true)).join('');
      html += '</div>';

      return html;
    }

    function toggleMessageGroup(groupId) {
      const content = document.getElementById(groupId);
      const header = content?.previousElementSibling;
      if (content && header) {
        content.classList.toggle('expanded');
        header.classList.toggle('expanded');
        const badge = header.querySelector('.message-badge');
        if (badge) {
          badge.textContent = content.classList.contains('expanded') ? 'click to collapse' : 'click to expand';
        }
      }
    }

    function renderPayload(entry) {
      const payload = entry.payload;
      if (!payload) return '<pre>' + escapeHtml(JSON.stringify(entry, null, 2)) + '</pre>';

      let html = '';

      if (payload.system) {
        let systemText = extractSystemText(payload.system);
        html += '<div class="payload-section"><h4>System Prompt (' + systemText.length + ' chars)</h4><pre class="system-prompt">' + escapeHtml(systemText) + '</pre></div>';
      }

      if (payload.messages) {
        html += '<div class="payload-section"><h4>Messages (' + payload.messages.length + ')</h4>' + renderMessages(payload.messages) + '</div>';
      }

      if (payload.tools) {
        html += '<div class="payload-section"><h4>Tools (' + payload.tools.length + ')</h4><pre>' + escapeHtml(payload.tools.map(t => '• ' + t.name).join('\\n')) + '</pre></div>';
      }

      if (entry.usage) {
        html += '<div class="payload-section"><h4>Usage</h4><pre>' + escapeHtml(JSON.stringify(entry.usage, null, 2)) + '</pre></div>';
      }

      return html || '<pre>' + escapeHtml(JSON.stringify(entry, null, 2)) + '</pre>';
    }

    function getEntryKey(entry) {
      return (entry.ts || '') + '-' + (entry.runId || '') + '-' + (entry.stage || '');
    }

    function getSessionDisplayName(sessionKey) {
      if (!sessionKey) return 'Unknown';
      // Extract user part: agent:main:user:5028574:1770190701878-j8ktqbgu8 -> user:5028574
      const parts = sessionKey.split(':');
      if (parts.length >= 4 && parts[2] === 'user') {
        return 'User ' + parts[3].slice(0, 8);
      }
      if (sessionKey.includes('agent:main:main')) {
        return 'Default Session';
      }
      return sessionKey.slice(0, 20);
    }

    function getSessionTime(entries) {
      if (!entries.length) return '';
      const first = entries[entries.length - 1];
      return formatTimestamp(first.ts);
    }

    function groupBySession(entries) {
      const groups = new Map();
      for (const entry of entries) {
        const key = entry.sessionKey || entry.sessionId || 'unknown';
        if (!groups.has(key)) {
          groups.set(key, { sessionKey: key, entries: [], runs: new Map() });
        }
        const group = groups.get(key);
        group.entries.push(entry);

        // Also group by runId within session
        const runId = entry.runId || 'unknown';
        if (!group.runs.has(runId)) {
          group.runs.set(runId, []);
        }
        group.runs.get(runId).push(entry);
      }
      return Array.from(groups.values());
    }

    function renderSidebar(sessions) {
      const container = document.getElementById('sessionList');

      let html = '<div class="all-sessions' + (selectedSession === null && selectedRun === null ? ' selected' : '') + '" onclick="selectAll()">📋 All Entries (' + allEntries.length + ')</div>';

      for (const session of sessions) {
        const isExpanded = expandedSessions.has(session.sessionKey);
        const isSelected = selectedSession === session.sessionKey && selectedRun === null;
        const displayName = getSessionDisplayName(session.sessionKey);
        const sessionTime = getSessionTime(session.entries);
        const runCount = session.runs.size;

        html += '<div class="session-group">';
        html += '<div class="session-header' + (isSelected ? ' selected' : '') + '" onclick="toggleSession(event, \\'' + escapeHtml(session.sessionKey) + '\\')">';
        html += '<div class="session-info">';
        html += '<div class="session-name">' + (isExpanded ? '▼' : '▶') + ' ' + escapeHtml(displayName) + '</div>';
        html += '<div class="session-meta">' + sessionTime + '</div>';
        html += '</div>';
        html += '<span class="session-count">' + session.entries.length + '</span>';
        html += '</div>';

        html += '<div class="run-list' + (isExpanded ? ' expanded' : '') + '">';
        const runsArray = Array.from(session.runs.entries());
        for (const [runId, runEntries] of runsArray) {
          const isRunSelected = selectedRun === runId;
          const firstEntry = runEntries[runEntries.length - 1];
          html += '<div class="run-item' + (isRunSelected ? ' selected' : '') + '" onclick="selectRun(event, \\'' + escapeHtml(session.sessionKey) + '\\', \\'' + escapeHtml(runId) + '\\')">';
          html += '<span>Run ' + runId.slice(0, 8) + '</span>';
          html += '<span class="run-time">' + formatTime(firstEntry.ts) + ' (' + runEntries.length + ')</span>';
          html += '</div>';
        }
        html += '</div>';
        html += '</div>';
      }

      container.innerHTML = html;
    }

    function toggleSession(event, sessionKey) {
      event.stopPropagation();
      const sidebarScroll = document.querySelector('.sidebar')?.scrollTop || 0;
      if (expandedSessions.has(sessionKey)) {
        expandedSessions.delete(sessionKey);
      } else {
        expandedSessions.add(sessionKey);
      }
      // Select the session
      selectedSession = sessionKey;
      selectedRun = null;
      renderUI(false);
      // Restore sidebar scroll only
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) sidebar.scrollTop = sidebarScroll;
    }

    function selectAll() {
      const sidebarScroll = document.querySelector('.sidebar')?.scrollTop || 0;
      selectedSession = null;
      selectedRun = null;
      renderUI(false);
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) sidebar.scrollTop = sidebarScroll;
    }

    function selectRun(event, sessionKey, runId) {
      event.stopPropagation();
      const sidebarScroll = document.querySelector('.sidebar')?.scrollTop || 0;
      selectedSession = sessionKey;
      selectedRun = runId;
      renderUI(false);
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) sidebar.scrollTop = sidebarScroll;
    }

    function getFilteredEntries() {
      if (selectedSession === null) {
        return allEntries;
      }
      let filtered = allEntries.filter(e => (e.sessionKey || e.sessionId || 'unknown') === selectedSession);
      if (selectedRun !== null) {
        filtered = filtered.filter(e => e.runId === selectedRun);
      }
      return filtered;
    }

    function renderLogs(entries) {
      const logsDiv = document.getElementById('logs');
      const statsDiv = document.getElementById('stats');

      if (entries.length === 0) {
        logsDiv.innerHTML = '<div class="empty-state"><p>No log entries.</p></div>';
        statsDiv.innerHTML = 'Showing: 0 entries';
        return;
      }

      statsDiv.innerHTML = 'Showing: ' + entries.length + ' entries' +
        (selectedSession ? ' | Session: ' + getSessionDisplayName(selectedSession) : '') +
        (selectedRun ? ' | Run: ' + selectedRun.slice(0, 8) : '');

      logsDiv.innerHTML = entries.map((entry) => {
        const stage = entry.stage || 'unknown';
        const entryKey = getEntryKey(entry);
        const isExpanded = expandedEntries.has(entryKey);
        return '<div class="log-entry" data-key="' + entryKey + '">' +
          '<div class="log-header" onclick="toggleEntry(this, \\'' + entryKey + '\\')">' +
            '<div class="log-meta">' +
              '<span class="log-stage stage-' + stage + '">' + stage + '</span>' +
              '<span>' + formatTimestamp(entry.ts) + '</span>' +
              '<span>Run: ' + (entry.runId || '-').slice(0, 8) + '</span>' +
              '<span>Model: ' + (entry.modelId || '-') + '</span>' +
            '</div>' +
            '<span class="toggle-icon">' + (isExpanded ? '▲' : '▼') + '</span>' +
          '</div>' +
          '<div class="log-body' + (isExpanded ? ' expanded' : '') + '">' + renderPayload(entry) + '</div>' +
        '</div>';
      }).join('');
    }

    function saveScrollPositions() {
      const positions = {
        sidebar: document.querySelector('.sidebar')?.scrollTop || 0,
        main: document.querySelector('.main-content')?.scrollTop || 0,
        logBodies: {}
      };
      // Save scroll positions of expanded log bodies
      document.querySelectorAll('.log-body.expanded').forEach(body => {
        const entry = body.closest('.log-entry');
        const key = entry?.getAttribute('data-key');
        if (key) {
          positions.logBodies[key] = body.scrollTop;
        }
      });
      return positions;
    }

    function restoreScrollPositions(positions) {
      if (!positions) return;
      const sidebar = document.querySelector('.sidebar');
      const main = document.querySelector('.main-content');
      if (sidebar) sidebar.scrollTop = positions.sidebar;
      if (main) main.scrollTop = positions.main;
      // Restore scroll positions of expanded log bodies
      requestAnimationFrame(() => {
        document.querySelectorAll('.log-body.expanded').forEach(body => {
          const entry = body.closest('.log-entry');
          const key = entry?.getAttribute('data-key');
          if (key && positions.logBodies[key] !== undefined) {
            body.scrollTop = positions.logBodies[key];
          }
        });
      });
    }

    function renderUI(preserveScroll = false) {
      const scrollPositions = preserveScroll ? saveScrollPositions() : null;
      const sessions = groupBySession(allEntries);
      renderSidebar(sessions);
      renderLogs(getFilteredEntries());
      if (scrollPositions) {
        restoreScrollPositions(scrollPositions);
      }
    }

    async function refresh(incremental = false) {
      const logsDiv = document.getElementById('logs');

      try {
        const data = await fetchLogs();

        if (incremental && allEntries.length > 0) {
          // Find new entries by comparing timestamps
          const existingKeys = new Set(allEntries.map(e => getEntryKey(e)));
          const newEntries = data.entries.filter(e => !existingKeys.has(getEntryKey(e)));

          if (newEntries.length > 0) {
            // Prepend new entries
            allEntries = [...newEntries, ...allEntries];
            // Limit total entries to avoid memory issues
            const limit = parseInt(document.getElementById('limit').value) || 100;
            if (allEntries.length > limit) {
              allEntries = allEntries.slice(0, limit);
            }
            renderUI(true); // Preserve scroll positions for incremental refresh
          }
          // If no new entries, don't re-render (keep expanded states and scroll)
        } else {
          // Full refresh
          allEntries = data.entries;
          renderUI(false);
        }
      } catch (err) {
        logsDiv.innerHTML = '<div class="empty-state">Error loading logs: ' + err.message + '</div>';
      }
    }

    function toggleEntry(header, entryKey) {
      const entry = header.closest('.log-entry');
      const body = entry.querySelector('.log-body');
      const icon = header.querySelector('.toggle-icon');

      if (body.classList.contains('expanded')) {
        body.classList.remove('expanded');
        icon.textContent = '▼';
        expandedEntries.delete(entryKey);
      } else {
        body.classList.add('expanded');
        icon.textContent = '▲';
        expandedEntries.add(entryKey);
      }
    }

    function toggleAutoRefresh() {
      const btn = document.getElementById('autoBtn');
      if (autoRefresh) {
        clearInterval(autoRefresh);
        autoRefresh = null;
        btn.textContent = 'Auto: Off';
        btn.classList.remove('active');
      } else {
        autoRefresh = setInterval(() => refresh(true), 5000);
        btn.textContent = 'Auto: On';
        btn.classList.add('active');
      }
    }

    async function clearLogs() {
      const type = document.getElementById('logType').value;
      const typeName = type === 'payload' ? 'Anthropic Payload' : 'Raw Stream';
      if (!confirm('Clear all ' + typeName + ' logs? This cannot be undone.')) {
        return;
      }
      try {
        const res = await fetch('/logs/api/clear?type=' + type, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          alert('Cleared ' + data.deleted + ' log file(s)');
          expandedEntries.clear();
          expandedSessions.clear();
          selectedSession = null;
          selectedRun = null;
          refresh();
        } else {
          alert('Failed to clear logs: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Error clearing logs: ' + err.message);
      }
    }

    document.getElementById('logType').onchange = () => {
      expandedEntries.clear();
      selectedSession = null;
      selectedRun = null;
      refresh();
    };
    document.getElementById('limit').onchange = refresh;
    refresh();
  </script>
</body>
</html>`;

export function createLogsViewerRoute() {
  return {
    path: "/logs",
    handler: async (_req: IncomingMessage, res: ServerResponse) => {
      sendHtml(res, VIEWER_HTML);
    },
  };
}

export function createLogsApiRoute() {
  return {
    path: "/logs/api",
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const logType = url.searchParams.get("type") || "payload";
      const limit = parseInt(url.searchParams.get("limit") || "100", 10);

      const logFile = logType === "raw" ? RAW_STREAM_LOG : PAYLOAD_LOG;
      const lines = readLastLines(logFile, limit);
      const entries = parseLogLines(lines);

      sendJson(res, {
        file: path.basename(logFile),
        total: lines.length,
        entries,
      });
    },
  };
}

export function createLogsClearRoute() {
  return {
    path: "/logs/api/clear",
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== "POST") {
        res.statusCode = 405;
        sendJson(res, { success: false, error: "Method not allowed" });
        return;
      }

      const url = new URL(req.url ?? "/", "http://localhost");
      const logType = url.searchParams.get("type") || "payload";

      try {
        let deleted = 0;
        const filesToClear = logType === "raw"
          ? [RAW_STREAM_LOG]
          : logType === "all"
            ? [PAYLOAD_LOG, RAW_STREAM_LOG]
            : [PAYLOAD_LOG];

        for (const file of filesToClear) {
          if (fs.existsSync(file)) {
            fs.writeFileSync(file, "");
            deleted++;
          }
        }

        sendJson(res, { success: true, deleted });
      } catch (err) {
        sendJson(res, { success: false, error: String(err) });
      }
    },
  };
}
