// ==UserScript==
// @name           YouTrack Checkboxes
// @description    Adds checkboxes functionality to YouTrack issues
// @include        https://timepad.myjetbrains.com/youtrack/issue/TP-*
// ==/UserScript==
(function() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }

    function guid() {
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
    }

    function checkbox_uid() {
    	return s4() + s4();
	}

	function updateCommentData(c) {
    	// обновляем current
    	commentsData[c.__yc_key].currentHtml = c.innerHTML;

    	// обновляем advanced
    	prepareAdvancedHtml(c);
	}

    function storeCommentData(c) {
        var key = guid(); // generate random id

        c.__yc_key = key; // yc = youtrack checkboxes

        commentsData[key] = {
            node: c,
            currentHtml: c.innerHTML,		// нормальный текущий html с - [ ]
            advancedHtml: c.innerHTML,		// текущий html с YT_CHECKBOX...
            originalHtml: c.innerHTML		// первоначальный вариант
        };
    }

    function prepareAdvancedHtml(c) {
        var	data = commentsData[c.__yc_key],
            advancedHtml = data.advancedHtml;

        // заменяем unchecked галочки
        while (advancedHtml.match(/_\[ ]/)) {
            advancedHtml = advancedHtml.replace(/_\[ ]/, 'YT_CHECKBOX_' + checkbox_uid() + '_UNCHECKED');
        }

        // заменяем checked галочки
        while (advancedHtml.match(/_\[[xх]]/)) {
            advancedHtml = advancedHtml.replace(/_\[[xх]]/, 'YT_CHECKBOX_' + checkbox_uid() + '_CHECKED');
        }

        data.advancedHtml = advancedHtml;
	}

    function replaceBracesToCheckboxes(c) {
		var	data = commentsData[c.__yc_key],
			currentHtml = data.advancedHtml,
			regexp = /YT_CHECKBOX_([0-9a-f]{8})_(UN)?CHECKED/,
			match;

		// заменяем на настоящие чекбоксы
		while (match = currentHtml.match(regexp)) {
			var id = match[1];

			if (match[2]) { // если есть приставка UN
				currentHtml = currentHtml.replace(regexp, '<input type="checkbox" id="yc_' + id + '">');
			} else {
                currentHtml = currentHtml.replace(regexp, '<input type="checkbox" id="yc_' + id + '" checked="checked">');
			}
		}

		// запоминаем
		data.currentHtml = currentHtml;

		// применяем на живом комменте
		c.innerHTML = currentHtml;
	}

	var commentsData = { },
		comments = document.querySelectorAll('.wiki.text');

    // запоминаем о комментах все нужное
	comments.forEach(storeCommentData);

	setTimeout(function() {
		var comments = document.querySelectorAll('.wiki.text');

		comments.forEach(function (c) {
			if (!c.__yc_key) {
				storeCommentData(c);
			}

            updateCommentData(c);
			replaceBracesToCheckboxes(c);
        });
	}, 1000);
})();