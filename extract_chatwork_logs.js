(async function() {
    const TARGET_YEARS_AGO = 1; 
    const now = new Date();
    const stopDate = new Date(now.getFullYear() - TARGET_YEARS_AGO, now.getMonth(), now.getDate());

    console.log("%c🚀 抽出処理を開始します（最終安定版・添付ファイル対応）", "color: #007bff; font-size: 16px; font-weight: bold;");

    const timeline = document.getElementById('_chatTimeLine') || 
                     document.querySelector('.chatTimeLine') || 
                     document.querySelector('[role="main"]');

    if (!timeline) {
        alert("タイムラインが見つかりませんでした。チャット画面を開いた状態で実行してください。");
        return;
    }

    const roomTitleEl = document.querySelector('[data-testid="room-title"]') || document.querySelector('h1');
    const roomName = roomTitleEl ? roomTitleEl.innerText.trim().replace(/[\\/:*?"<>|]/g, '_') : "Chatworkルーム";

    let allMessages = new Map();
    let lastTopId = "";
    let retryCount = 0;
    
    // 状態管理
    let currentDay = "";
    let currentSender = "不明";

    const parseDate = (str) => {
        if (!str) return null;
        const m = str.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        return m ? new Date(m[1], parseInt(m[2]) - 1, m[3]) : new Date();
    };

    const extractBodyText = (el) => {
        const pre = el.querySelector('pre');
        if (!pre) return el.innerText.trim();

        const bodyClone = pre.cloneNode(true);
        
        // 引用ボックスを読みやすく整形
        bodyClone.querySelectorAll('.chatQuote, blockquote, .dev_quote').forEach(q => {
            const qTitle = q.querySelector('.chatQuote__title')?.innerText.trim() || "引用";
            const qBody = q.querySelector('.quoteText')?.innerText.trim() || q.innerText.trim();
            q.innerText = `\n[引用: ${qTitle}]\n${qBody.split('\n').map(line => `> ${line}`).join('\n')}\n`;
        });

        // 不要なシステム要素を削除（宛先タグ、ボタン、SVGを削除。Infoエリアはテキストを残すため削除しない）
        const toRemove = bodyClone.querySelectorAll('.chatTimeLineReply, [data-cwtag], button, svg, time');
        toRemove.forEach(s => s.remove());
        
        return bodyClone.innerText.trim();
    };

    while (true) {
        // タイムライン内の要素（日付ラベル、メッセージ）を順番に走査
        const allItems = Array.from(timeline.querySelectorAll('.chatTimeLine__date, .chatTimeLineDate, div[data-mid]'));

        allItems.forEach(el => {
            // A. 日付ラベルの更新
            if (el.classList.contains('chatTimeLine__date') || el.classList.contains('chatTimeLineDate')) {
                const dateMatch = el.innerText.trim().match(/(\d{4}年\d{1,2}月\d{1,2}日)/);
                if (dateMatch) currentDay = dateMatch[1];
                return;
            }

            // B. メッセージの処理
            const mid = el.getAttribute('data-mid');
            if (mid && !allMessages.has(mid)) {
                
                // 1. 投稿者の特定
                const nameEl = el.querySelector('[data-testid="timeline_user-name"]');
                if (nameEl && nameEl.innerText.trim()) {
                    currentSender = nameEl.innerText.trim();
                }

                // 2. 時刻の取得
                const timeEl = el.querySelector('._timeStamp, time, [class*="Time"]');
                let rawTime = "";
                if (timeEl) {
                    Array.from(timeEl.childNodes).forEach(node => {
                        if (node.nodeType === Node.TEXT_NODE) rawTime += node.textContent;
                        else if (node.tagName === 'SPAN') rawTime += node.innerText;
                    });
                    const tMatch = rawTime.match(/(\d{4}年\d{1,2}月\d{1,2}日\s+)?\d{1,2}:\d{2}/);
                    rawTime = tMatch ? tMatch[0] : rawTime.trim();
                }
                
                const fullTime = (rawTime && !rawTime.includes('年') && currentDay) 
                                 ? `${currentDay} ${rawTime}` 
                                 : (rawTime || currentDay);

                // 3. To / CC / ReplyTo の抽出
                let toList = [];
                let ccList = [];
                let replyToId = "";

                el.querySelectorAll('[data-cwtag]').forEach(tagEl => {
                    const tag = tagEl.getAttribute('data-cwtag');
                    let name = "";
                    let next = tagEl.nextSibling;
                    while(next && next.nodeType === Node.TEXT_NODE && next.textContent.trim() === "") {
                        next = next.nextSibling;
                    }
                    if (next) {
                        const fullContent = next.textContent || next.innerText || "";
                        name = fullContent.split('\n')[0].replace(/[さん|様]/g, '').trim();
                    }

                    if (tag.startsWith('[To:')) {
                        if (name && !toList.includes(name)) toList.push(name);
                    } else if (tag.startsWith('[CC:')) {
                        if (name && !ccList.includes(name)) ccList.push(name);
                    } else if (tag.startsWith('[rp ')) {
                        const rpMatch = tag.match(/to=\d+-(\d+)/);
                        if (rpMatch) replyToId = rpMatch[1];
                        const rpNameImg = tagEl.querySelector('img[alt]');
                        const rpName = rpNameImg ? rpNameImg.getAttribute('alt').replace(/[さん|様]/g, '').trim() : name;
                        if (rpName && !toList.includes(rpName)) toList.push(rpName);
                    }
                });

                // 4. 添付ファイルの抽出
                let attachments = [];
                el.querySelectorAll('.chatInfo a[href*="download_file.php"], a[href*="preview_file.php"]').forEach(fileLink => {
                    attachments.push({
                        name: fileLink.innerText.trim(),
                        url: fileLink.href
                    });
                });

                allMessages.set(mid, {
                    id: mid,
                    time: fullTime,
                    user: currentSender,
                    to: toList.join(', '),
                    cc: ccList.join(', '),
                    replyTo: replyToId,
                    text: extractBodyText(el),
                    files: attachments // 添付ファイル情報を追加
                });
            }
        });

        // 遡り処理
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
    
    // ファイル名生成
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
    
    alert(`完了しました！\n取得件数: ${result.length}件\n添付ファイルの情報(files)も含まれています。`);
})();
