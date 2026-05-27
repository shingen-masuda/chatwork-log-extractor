(async function() {
    const TARGET_YEARS_AGO = 1; 
    const now = new Date();
    const stopDate = new Date(now.getFullYear() - TARGET_YEARS_AGO, now.getMonth(), now.getDate());

    console.log("%c🚀 抽出処理を開始します（完全セマンティック解析版）", "color: #007bff; font-size: 16px; font-weight: bold;");

    const timeline = document.getElementById('_chatTimeLine') || 
                     document.querySelector('.chatTimeLine') || 
                     document.querySelector('[role="main"]');

    if (!timeline) {
        alert("タイムラインが見つかりませんでした。");
        return;
    }

    const roomTitleEl = document.querySelector('[data-testid="room-title"]') || document.querySelector('h1');
    const roomName = roomTitleEl ? roomTitleEl.innerText.trim().replace(/[\\/:*?"<>|]/g, '_') : "Chatworkルーム";

    let allMessages = new Map();
    let lastTopId = "";
    let retryCount = 0;
    
    let currentDay = "";
    let currentSender = "不明";

    const parseDate = (str) => {
        if (!str) return null;
        const m = str.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        return m ? new Date(m[1], parseInt(m[2]) - 1, m[3]) : new Date();
    };

    while (true) {
        const allItems = Array.from(timeline.querySelectorAll('.chatTimeLine__date, .chatTimeLineDate, div[data-mid]'));

        allItems.forEach(el => {
            // A. 日付ラベル
            if (el.classList.contains('chatTimeLine__date') || el.classList.contains('chatTimeLineDate')) {
                const dateMatch = el.innerText.trim().match(/(\d{4}年\d{1,2}月\d{1,2}日)/);
                if (dateMatch) currentDay = dateMatch[1];
                return;
            }

            // B. メッセージ
            const mid = el.getAttribute('data-mid');
            if (mid && !allMessages.has(mid)) {
                
                // --- 1. 投稿者の特定 ---
                const nameEl = el.querySelector('[data-testid="timeline_user-name"]');
                if (nameEl && nameEl.innerText.trim()) {
                    currentSender = nameEl.innerText.trim();
                }

                // --- 2. 時刻の取得 ---
                // "返信元"などのテキストを拾わないよう、必ず `_timeStamp` か `time` タグを明示指定
                const timeEl = el.querySelector('._timeStamp, time');
                let rawTime = "";
                if (timeEl) {
                    // childNodesをチェックし、要素内テキストのみ抽出（余計なアイコンテキストを除外）
                    Array.from(timeEl.childNodes).forEach(n => {
                        if (n.nodeType === Node.TEXT_NODE) {
                            // "返信元" のようなノイズを排除し、純粋な時間表記のみ抽出
                            const text = n.textContent.trim();
                            if (/^\d{1,2}:\d{2}$/.test(text) || /\d{4}年/.test(text)) {
                                rawTime += text;
                            }
                        }
                    });
                }
                
                // rawTime が無ければフォールバックとして親要素のinnerTextから正規表現で時間を探す
                if (!rawTime) {
                    const fallbackTime = el.innerText.match(/\d{1,2}:\d{2}/);
                    if (fallbackTime) rawTime = fallbackTime[0];
                }

                const fullTime = (rawTime && !rawTime.includes('年') && currentDay) 
                                 ? `${currentDay} ${rawTime}` 
                                 : (rawTime || currentDay);

                // --- 3. To / CC / ReplyTo の抽出 ---
                let toList = [];
                let ccList = [];
                let replyToId = "";

                el.querySelectorAll('[data-cwtag]').forEach(tagEl => {
                    const tag = tagEl.getAttribute('data-cwtag');
                    
                    // タグ要素の中にユーザー名がないか確認（[rp] や [To:] は通常 img の alt か次の要素）
                    let name = "";
                    const img = tagEl.querySelector('img[alt]');
                    if (img) {
                        name = img.getAttribute('alt');
                    } else {
                        const next = tagEl.nextElementSibling;
                        if (next && (next.nodeType === Node.TEXT_NODE || next.tagName === 'SPAN')) {
                            name = next.textContent || next.innerText;
                        }
                    }
                    name = name ? name.replace(/[さん|様]/g, '').trim() : "";

                    if (tag.startsWith('[To:')) {
                        if (name && !toList.includes(name)) toList.push(name);
                    } else if (tag.startsWith('[CC:')) {
                        if (name && !ccList.includes(name)) ccList.push(name);
                    } else if (tag.startsWith('[rp ')) {
                        const rpMatch = tag.match(/to=\d+-(\d+)/);
                        if (rpMatch) replyToId = rpMatch[1];
                        if (name && !toList.includes(name)) toList.push(name);
                    }
                });

                // --- 4. 本文の抽出 ---
                const pre = el.querySelector('pre');
                let finalText = "";

                if (pre) {
                    // preノードの子要素を順番に走査してテキストを構築
                    Array.from(pre.childNodes).forEach(child => {
                        if (child.nodeType === Node.TEXT_NODE) {
                            finalText += child.textContent;
                        } else if (child.nodeType === Node.ELEMENT_NODE) {
                            // 引用（Quote）の処理
                            if (child.classList.contains('chatQuote') || child.classList.contains('dev_quote')) {
                                const qTitle = child.querySelector('.chatQuote__title')?.innerText.trim() || "引用";
                                const qBody = child.querySelector('.quoteText')?.innerText.trim() || child.innerText.trim();
                                finalText += `\n[引用: ${qTitle}]\n${qBody.split('\n').map(line => `> ${line}`).join('\n')}\n`;
                            } 
                            // 添付ファイルやインフォメーション
                            else if (child.classList.contains('chatInfo')) {
                                finalText += `\n[添付/Info: ${child.innerText.trim()}]\n`;
                            }
                            // 宛先タグ([To:], [rp]等)は無視して、それ以外のspanなどを追加
                            else if (!child.getAttribute('data-cwtag')) {
                                finalText += child.innerText;
                            }
                        }
                    });
                } else {
                    finalText = el.innerText;
                }

                // 余計な「返信元」テキストが混じっていたら削除
                finalText = finalText.replace(/^返信元\s*/, '').trim();

                allMessages.set(mid, {
                    id: mid,
                    time: fullTime,
                    user: currentSender,
                    to: toList.join(', '),
                    cc: ccList.join(', '),
                    replyTo: replyToId,
                    text: finalText
                });
            }
        });

        const msgNodes = Array.from(timeline.querySelectorAll('div[data-mid]'));
        if (msgNodes.length === 0) break;
        const topMsg = msgNodes[0];
        const topId = topMsg.getAttribute('data-mid');
        
        let topTimeStr = currentDay;
        const topTimeEl = topMsg.querySelector('._timeStamp, time');
        if (topTimeEl) {
             const tMatch = topTimeEl.innerText.match(/\d{1,2}:\d{2}/);
             if (tMatch) topTimeStr = `${currentDay} ${tMatch[0]}`;
        }
        
        const topDate = parseDate(topTimeStr);

        console.log(`[進行中] 日付: ${currentDay || "遡り中"} / 取得数: ${allMessages.size}件`);

        if (topDate && topDate < stopDate) break;
        if (topId === lastTopId) {
            if (++retryCount > 15) break;
        } else {
            retryCount = 0;
            lastTopId = topId;
        }

        timeline.scrollTop = 0;
        await new Promise(r => setTimeout(r, 2000));
    }

    const result = Array.from(allMessages.values()).sort((a, b) => a.id.localeCompare(b.id, undefined, {numeric: true}));
    
    const fmt = (dStr) => {
        const d = parseDate(dStr);
        return d ? (d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2)) : "不明";
    };
    const period = result.length > 0 ? `${fmt(result[0].time)}-${fmt(result[result.length - 1].time)}` : "不明";
    const fileName = `${roomName}_${fmt(new Date().toLocaleDateString())}_${period}.json`;

    const blob = new Blob([JSON.stringify(result, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    
    alert(`完了しました！\nTo/Timeの重複を解消しました。\n取得件数: ${result.length}件`);
})();
