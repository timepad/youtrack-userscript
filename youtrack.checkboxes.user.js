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
     * Класс для работы с чекбоксом
     */
    class Checkbox {
        constructor() {
            this.id = Unique.id();
        }

        /**
         * Проверяет, добавили ли мы уже ноду
         * @return {boolean}
         */
        hasNode() {
            return !!this.node;
        }

        /**
         * Запоминает ноду в объекте
         * @param node
         */
        setNode(node) {
            this.node = node;
            this.node.__checkbox_id = this.id;
        }

        /**
         * Устанавливает коллбек на изменение
         */
        setCallback() {
            this.node.addEventListener('change', this.checkboxChanged);
        }

        /**
         * Метод, который вызывается при изменении состояния чекбокса
         */
        checkboxChanged() {
            console.log('checkbox changed');
        }
    }

    /**
     * Хранилище чекбоксов
     */
    class CheckboxStore {
        constructor() {
            this.checkboxes = {};
        }

        add(c) {
            this.checkboxes[c.id] = c;
        }

        /**
         * Изначально объекты-чекбоксы создаются пустыми, они содержат только id
         * Этот метод добавляет им ноду и вешает колбек на ее изменение
         */
        saveCheckboxNodes() {
            let checkboxes = this.checkboxes;

            for (let id in checkboxes) {
                if (checkboxes.hasOwnProperty(id)) {
                    let checkbox = checkboxes[id];

                    // если еще не запомнили ноду
                    if (!checkbox.hasNode()) {
                        let node = document.getElementById(id);

                        // запоминаем
                        checkbox.setNode(node);

                        // вешаем коллбек
                        checkbox.setCallback();
                    }
                }
            }
        }
    }

    /**
     * Класс для работы с комментарием
     */
    class Comment {
        constructor(node) {
            this.id = Unique.id();

            this.node = node;
            this.node.__comment_id = this.id;

            this.currentHtml = node.innerHTML;
            this.preparedHtml = node.innerHTML;

            // создаем пустое хранилище чекбоксов
            this.checkboxStore = new CheckboxStore();

            // сразу подготавливаем коммент
            this.prepareHtml();
        }

        /**
         * Заменяет в комментарии все _[ ] на строки вида YT_CHECKBOX_34f91ad6cce2_CHECKED
         */
        prepareHtml() {
            let html = this.preparedHtml;

            // заменяем unchecked галочки
            while (html.match(/_\[ ]/)) {
                // нашли еще не распарсенный чекбокс, создаем новый
                let checkbox = new Checkbox();

                // добавляем в хранилище
                this.checkboxStore.add(checkbox);

                // заменяем в html
                html = html.replace(/_\[ ]/, `YT_CHECKBOX_${checkbox.id}_UNCHECKED`);
            }

            // заменяем checked галочки
            // xх - латинский и кириллический
            while (html.match(/_\[[xх]]/)) {
                // нашли еще не распарсенный чекбокс, создаем новый
                let checkbox = new Checkbox();

                // добавляем в хранилище
                this.checkboxStore.add(checkbox);

                // заменяем в html
                html = html.replace(/_\[[xх]]/, `YT_CHECKBOX_${checkbox.id}_CHECKED`);
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
                    html = html.replace(regexp, `<input type="checkbox" id="${id}">`);
                } else {
                    html = html.replace(regexp, `<input type="checkbox" id="${id}" checked="checked">`);
                }
            }

            // запоминаем
            this.currentHtml = html;

            // если что-то изменилось
            if (this.node.innerHTML !== html) {
                // заменяем html
                this.node.innerHTML = html;

                // добавляем колбеки к новым чекбоксам
                this.checkboxStore.saveCheckboxNodes();
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
        // каждый раз берем комментарии заново, могли добавиться новые
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