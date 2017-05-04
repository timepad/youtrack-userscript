// ==UserScript==
// @name           YouTrack Checkboxes
// @description    Adds checkboxes functionality to YouTrack issues
// @include        https://timepad.myjetbrains.com/youtrack/issue/TP-*
// ==/UserScript==
(function () {
    /**
     * Класс для генерации уникальных id
     */
    class Unique {
        static s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }

        static id() {
            return this.s4() + this.s4() + this.s4();
        }
    }

    /**
     * Класс для работы с комментарием
     */
    class Comment {
        constructor(c) {
            this.id = Unique.id();

            this.node = c;
            this.node.__comment_id = this.id;

            this.currentHtml = c.innerHTML;
            this.preparedHtml = c.innerHTML;

            this.prepareHtml();
        }

        /**
         * Заменяет в комментарии все _[ ] на строки вида YT_CHECKBOX_34f91ad6cce2_CHECKED
         */
        prepareHtml() {
            let html = this.preparedHtml;

            // заменяем unchecked галочки
            while (html.match(/_\[ ]/)) {
                html = html.replace(/_\[ ]/, `YT_CHECKBOX_${Unique.id()}_UNCHECKED`);
            }

            // заменяем checked галочки
            // xх - латинский и кириллический
            while (html.match(/_\[[xх]]/)) {
                html = html.replace(/_\[[xх]]/, `YT_CHECKBOX_${Unique.id()}_CHECKED`);
            }

            this.preparedHtml = html;
        }

        /**
         * Добавляет в живой комментарий чекбоксы
         */
        insertCheckboxes() {
            let html = this.preparedHtml,
                regexp = /YT_CHECKBOX_([0-9a-f]{12})_(UN)?CHECKED/,
                match;

            // заменяем на настоящие чекбоксы
            while (match = html.match(regexp)) {
                let id = match[1];

                if (match[2]) { // если есть приставка UN
                    html = html.replace(regexp, `<input type="checkbox" id="${id}" class="youtrack_checkbox">`);
                } else {
                    html = html.replace(regexp, `<input type="checkbox" id="${id}" class="youtrack_checkbox" checked="checked">`);
                }
            }

            // запоминаем
            this.currentHtml = html;

            // если что-то изменилось, заменяем
            if (this.node.innerHTML !== html) {
                this.node.innerHTML = html;
            }
        }

        /**
         * Обновляет комментарий
         * И объект, и живую DOM-ноду
         */
        update() {
            this.currentHtml = this.node.innerHTML;
            this.prepareHtml();
            this.insertCheckboxes();
        }
    }

    /**
     * Хранилище комментариев
     */
    class CommentStore {
        constructor() {
            this.comments = {};
        }

        /**
         * Добавляет комментарий в хранилище
         * @param {HTMLElement} c
         */
        add(c) {
            let comment = new Comment(c);

            this.comments[comment.id] = comment;
        }

        /**
         * Проверяет, есть ли этот комментарий в хранилище
         * @param c
         * @return {boolean}
         */
        stored(c) {
            return !!c.__comment_id;
        }

        /**
         * Обновляет все комментарии хранилища
         */
        update() {
            for (let id in this.comments) {
                if (this.comments.hasOwnProperty(id)) {
                    this.comments[id].update();
                }
            }
        }

        /**
         * Возвращает объект-комментарий
         * @param c
         * @return {Comment}
         */
        getCommentByNode(c) {
            return this.comments[c.__comment_id];
        }
    }

    // получим все комментарии на странице
    let commentNodes = document.querySelectorAll('.wiki.text'),
        commentStore = new CommentStore();

    // добавляем комментарии в хранилище
    commentNodes.forEach(c => commentStore.add(c));

    setInterval(() => {
        // берем комментарии заново, могли добавиться новые
        let commentNodes = document.querySelectorAll('.wiki.text');

        commentNodes.forEach(c => {
            // если это какой-то новый, добавляем в наш список
            if (!commentStore.stored(c)) {
                commentStore.add(c);
            }

            // обновляем комментарий
            commentStore
                .getCommentByNode(c)
                .update();
        });
    }, 100);
})();