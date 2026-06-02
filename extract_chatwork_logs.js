(async function() {
    const TARGET_YEARS_AGO = 2; 
    const now = new Date();
    const stopDate = new Date(now.getFullYear() - TARGET_YEARS_AGO, now.getMonth(), now.getDate());

    console.log("%c🚀 抽出処理を開始します（最終安定版・添付ファイル対応・2年遡り・連続投稿タイムスタンプ対応版）", "color: #007bff; font-size: 16px; font-weight: bold;");

    const timeline = document.getElementById('_chatTimeLine') || 
                     document.querySelector('.chatTimeLine') || 
                     document.querySelector('[role="main"]');

    if (!timeline) {
        alert("タイムラインが見つかりませんでした。チャット画面を開いた状態で実行してください。");
        return;
    }

    const roomTitleEl = document.querySelector('[data-testid="room-title"]') || document.querySelector('h1');
    let roomName = roomTitleEl ? roomTitleEl.innerText.trim().replace(/[\\/:*?"<>|]/g, '_') : "";
    if (!roomName) roomName = "Chatworkルーム";

    let allMessages = new Map();
    let lastTopId = "";
    let retryCount = 0;
    const MAX_RETRY = 25; // ロード待機リトライ回数
    let scrollContainer = null; // スクロールバーを持つ実際のコンテナ
    
    // 状態管理
    let currentDay = "";
    let currentSender = "不明";

    // メッセージ要素の祖先から実際にスクロール可能な親要素を探す関数
    const findScrollContainer = (el) => {
        let parent = el.parentElement;
        while (parent && parent !== document.body) {
            const style = window.getComputedStyle(parent);
            const overflowY = style.overflowY || style.overflow;
            const isScrollable = overflowY === 'auto' || overflowY === 'scroll' || parent.scrollHeight > parent.clientHeight;
            if (isScrollable && parent.clientHeight > 0) {
                return parent;
            }
            parent = parent.parentElement;
        }
        return null;
    };

    const parseDate = (str) => {
        if (!str) return null;
        const m = str.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        return m ? new Date(m[1], parseInt(m[2]) - 1, m[3]) : null;
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
        // メッセージ要素（div[data-mid]）だけを確実に走査する
        const allItems = Array.from(timeline.querySelectorAll('div[data-mid]'));

        // 画面内に表示されているメッセージの中から、上から順に見て最初に日付（年・月・日）が特定できるものを探す
        // Chatworkは連続投稿時にタイムスタンプ要素が省略されるため、最上部メッセージがタイムスタンプを持たない場合への対策
        let detectedTopDate = null;
        let detectedTopDateStr = "遡り中";

        for (let i = 0; i < allItems.length; i++) {
            const msg = allItems[i];
            const timeEl = msg.querySelector('._timeStamp, time, [class*="Time"]');
            if (timeEl) {
                const titleAttr = timeEl.getAttribute('title') || "";
                const datetimeAttr = timeEl.getAttribute('datetime') || "";
                
                const tMatch = titleAttr.match(/(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})/);
                if (tMatch) {
                    detectedTopDate = new Date(tMatch[1], parseInt(tMatch[2]) - 1, tMatch[3]);
                    detectedTopDateStr = `${tMatch[1]}年${parseInt(tMatch[2])}月${parseInt(tMatch[3])}日`;
                    break; // 最初（最も上＝最古）の有効な日付が見つかったので終了
                } else if (datetimeAttr) {
                    const parsedD = new Date(datetimeAttr);
                    if (!isNaN(parsedD.getTime())) {
                        detectedTopDate = parsedD;
                        detectedTopDateStr = `${parsedD.getFullYear()}年${parsedD.getMonth() + 1}月${parsedD.getDate()}日`;
                        break;
                    }
                }
            }
        }

        // 走査開始前に、現在表示されている範囲の最古の確定日付でcurrentDayを上書き初期化（逆戻り・上書きバグ防止）
        if (detectedTopDateStr !== "遡り中") {
            currentDay = detectedTopDateStr;
        }

        allItems.forEach(el => {
            const mid = el.getAttribute('data-mid');
            if (mid) {
                // 1. 投稿者の特定
                const nameEl = el.querySelector('[data-testid="timeline_user-name"]');
                if (nameEl && nameEl.innerText.trim()) {
                    currentSender = nameEl.innerText.trim();
                }

                // 2. 日付と時刻の取得
                const timeEl = el.querySelector('._timeStamp, time, [class*="Time"]');
                let rawTime = "";
                let msgDateStr = "";

                if (timeEl) {
                    const titleAttr = timeEl.getAttribute('title') || "";
                    const datetimeAttr = timeEl.getAttribute('datetime') || "";
                    
                    const tMatch = titleAttr.match(/(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})/);
                    if (tMatch) {
                        msgDateStr = `${tMatch[1]}年${parseInt(tMatch[2])}月${parseInt(tMatch[3])}日`;
                        currentDay = msgDateStr; // 時系列（上から下）に進むので、見つかる度に更新してOK
                    } else if (datetimeAttr) {
                        const parsedD = new Date(datetimeAttr);
                        if (!isNaN(parsedD.getTime())) {
                            msgDateStr = `${parsedD.getFullYear()}年${parsedD.getMonth() + 1}月${parsedD.getDate()}日`;
                            currentDay = msgDateStr;
                        }
                    }

                    // 時刻の取得
                    Array.from(timeEl.childNodes).forEach(node => {
                        if (node.nodeType === Node.TEXT_NODE) rawTime += node.textContent;
                        else if (node.tagName === 'SPAN') rawTime += node.innerText;
                    });
                    const tMatch2 = rawTime.match(/\d{1,2}:\d{2}/);
                    rawTime = tMatch2 ? tMatch2[0] : rawTime.trim();
                }
                
                // メッセージ自体から日付が取れない場合は、直近で判明した日付（currentDay）で補完
                const finalDate = msgDateStr || currentDay;
                const fullTime = (rawTime && finalDate) ? `${finalDate} ${rawTime}` : (rawTime || finalDate);

                // 既存のメッセージを確認
                const existing = allMessages.get(mid);
                const isTimeIncomplete = (t) => !t || !t.includes('年');

                // 新規登録、または既存メッセージの日付が不完全で今回完全な日付が取得できた場合
                if (!existing || (isTimeIncomplete(existing.time) && !isTimeIncomplete(fullTime))) {
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
                        user: currentSender || (existing ? existing.user : "不明"),
                        to: toList.join(', '),
                        cc: ccList.join(', '),
                        replyTo: replyToId,
                        text: extractBodyText(el),
                        files: attachments
                    });
                }
            }
        });

        // 遡り処理
        const msgNodes = Array.from(timeline.querySelectorAll('div[data-mid]'));
        if (msgNodes.length === 0) {
            console.log("%c[終了] タイムライン上にメッセージ要素が見つかりませんでした。", "color: red; font-weight: bold;");
            break;
        }
        const topMsg = msgNodes[0];
        const topId = topMsg.getAttribute('data-mid');
        
        // 初回のみスクロールコンテナを特定
        if (!scrollContainer) {
            scrollContainer = findScrollContainer(topMsg);
            if (scrollContainer) {
                console.log("📍 動的スクロールコンテナを特定しました:", scrollContainer);
            } else {
                console.log("⚠️ スクロールコンテナを自動特定できなかったため、デフォルト要素を使用します。");
                scrollContainer = timeline;
            }
        }

        console.log(`[進行中] 日付: ${detectedTopDateStr} / 取得数: ${allMessages.size}件`);

        if (detectedTopDate && detectedTopDate < stopDate) {
            console.log(`%c[正常終了] 過去${TARGET_YEARS_AGO}年分の日付制限（${stopDate.toLocaleDateString()}）に到達したため、抽出を終了します。`, "color: green; font-weight: bold;");
            break;
        }
        
        if (topId === lastTopId) {
            if (++retryCount > MAX_RETRY) {
                console.log(`%c[終了] タイムラインの最上部、または過去ログの読み込み限界に到達したため終了します（${MAX_RETRY}回ロードを試行しました）。\n※ルームの最古メッセージ、またはChatworkのプランによる閲覧制限（フリープランの直近40日制限など）の可能性があります。`, "color: orange; font-weight: bold;");
                break;
            }
        } else {
            retryCount = 0;
            lastTopId = topId;
        }

        scrollContainer.scrollTop = 0;
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
        
        await new Promise(r => setTimeout(r, 2000));
    }

    const result = Array.from(allMessages.values()).sort((a, b) => a.id.localeCompare(b.id, undefined, {numeric: true}));
    
    // メッセージから有効な日付（「年」が含まれるもの）をパース
    const validDates = result
        .map(m => m.time ? parseDate(m.time) : null)
        .filter(d => d !== null);

    let period = "期間不明";
    if (validDates.length > 0) {
        const minDate = new Date(Math.min(...validDates));
        const maxDate = new Date(Math.max(...validDates));
        
        const fmt = (d) => {
            return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
        };
        const startStr = fmt(minDate);
        const endStr = fmt(maxDate);
        if (startStr && endStr) {
            period = `${startStr}-${endStr}`;
        }
    } else {
        period = "全期間";
    }

    const getTodayFormatted = () => {
        const d = new Date();
        return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    };
    const todayStrCorrect = getTodayFormatted();
    const fileName = `${roomName}_${todayStrCorrect}_${period}.json`;

    const blob = new Blob([JSON.stringify(result, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    
    alert(`完了しました！\n取得件数: ${result.length}件\n添付ファイルの情報(files)も含まれています。`);
})();