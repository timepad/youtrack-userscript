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
        /**
         * @param {Text} owner
         */
        constructor(owner) {
            this.text = owner;
            this.id = Unique.id();
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
            this.node.addEventListener('change', () => this.checkboxChanged());
        }

        /**
         * Метод, который вызывается при изменении состояния чекбокса
         */
        checkboxChanged() {
            console.log('checkbox changed');

            let checked = this.node.checked,
                checkedString = `YT_CHECKBOX_${this.id}_CHECKED`,
                uncheckedString = `YT_CHECKBOX_${this.id}_UNCHECKED`;

            // обновляем нашу подготовленную строку
            this.text.preparedHtml = checked ?
                this.text.preparedHtml.replace(uncheckedString, checkedString) :
                this.text.preparedHtml.replace(checkedString, uncheckedString);

            // соответствующе обновляем plain-текст
            this.text.updatePlainText();
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
        updateCheckboxNodes() {
            let checkboxes = this.checkboxes;

            for (let id in checkboxes) {
                if (checkboxes.hasOwnProperty(id)) {
                    let checkbox = checkboxes[id],
                        node = document.getElementById(id);

                    // запоминаем
                    checkbox.setNode(node);

                    // вешаем коллбек
                    checkbox.setCallback();
                }
            }
        }
    }

    /**
     * Класс для работы с текстами
     */
    class Text {
        constructor(node) {
            this.id = Unique.id();

            this.node = node;
            this.node.__text_id = this.id;

            this.plainHtml = node.innerHTML;
            this.preparedHtml = node.innerHTML;
            this.checkboxHtml = node.innerHTML;

            // определяем, это описание, превью или обычный комментарий
            this.determineTextType();

            // создаем пустое хранилище чекбоксов
            this.checkboxStore = new CheckboxStore();

            // сразу подготавливаем текст
            this.prepareHtml();
        }

        /**
         * Заменяет в тексте все _[ ] на строки вида YT_CHECKBOX_34f91ad6cce2_CHECKED
         */
        prepareHtml() {
            let html = this.preparedHtml;

            // заменяем unchecked галочки
            while (html.match(/_\[ ]/)) {
                // нашли еще не распарсенный чекбокс, создаем новый
                let checkbox = new Checkbox(this);

                // добавляем в хранилище
                this.checkboxStore.add(checkbox);

                // заменяем в html
                html = html.replace(/_\[ ]/, `YT_CHECKBOX_${checkbox.id}_UNCHECKED`);
            }

            // заменяем checked галочки
            // xх - латинский и кириллический
            while (html.match(/_\[[xх]]/)) {
                // нашли еще не распарсенный чекбокс, создаем новый
                let checkbox = new Checkbox(this);

                // добавляем в хранилище
                this.checkboxStore.add(checkbox);

                // заменяем в html
                html = html.replace(/_\[[xх]]/, `YT_CHECKBOX_${checkbox.id}_CHECKED`);
            }

            this.preparedHtml = html;
        }

        /**
         * Заменяет в тексте конструкции вида YT_CHECKBOX_4d52adc499f3_CHECKED на чекбоксы
         */
        updateCheckboxText() {
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

            // сохраняем
            this.checkboxHtml = html;
        }

        /**
         * Заменяет в тексте конструкции вида YT_CHECKBOX_4d52adc499f3_CHECKED на _[x]
         */
        updatePlainText() {
            let html = this.preparedHtml,
                regexp = /YT_CHECKBOX_[0-9a-f]{12}_(UN)?CHECKED/,
                match;

            // заменяем на квадратные скобки
            while (match = html.match(regexp)) {
                if (match[1]) { // если есть приставка UN
                    html = html.replace(regexp, '_[ ]');
                } else {
                    html = html.replace(regexp, '_[x]');
                }
            }

            // сохраняем
            this.plainHtml = html;
        }

        /**
         * Обновляет живую дом-ноду
         */
        updateVisibleText() {
            // если что-то изменилось
            if (this.node.innerHTML !== this.checkboxHtml) {
                // заменяем html
                this.node.innerHTML = this.checkboxHtml;

                // html поменялся, все ноды неактуальные
                // обновляем и заново вешаем колбеки
                this.checkboxStore.updateCheckboxNodes();
            }
        }

        /**
         * Обновляет текст
         * И объект, и живую DOM-ноду
         */
        update() {
            this.prepareHtml();
            this.updateCheckboxText();
            this.updateVisibleText();
        }

        /**
         * Находит среди родителей элемент, у которого есть класс cls
         * @param cls
         * @return {HTMLElement | null} - найденный элемент или null
         */
        findAncestor(cls) {
            let element = this.node;

            while ((element = element.parentElement) && !element.classList.contains(cls));

            return element;
        }

        /**
         * Определяет, что из себя представляет этот текст
         * Описание тикета, превью нового комментария или существующий комментарий
         */
        determineTextType() {
            // если у родительского элемента есть класс description
            if (this.node.parentElement.classList.contains('description')) {
                this.description = true;
            } else if (this.node.parentElement.classList.contains('comment-preview')) {
                this.preview = true;
            } else {
                let commentRow = this.findAncestor('comment-row');

                if (commentRow) {
                    this.comment = true;

                    // тот id, под которым комментарий хранится в ютреке
                    this.commentId = commentRow.getAttribute('_id');
                } else {
                    console.error("Couldn't detrmine text type");
                }
            }
        }
    }

    /**
     * Хранилище текстов
     */
    class TextStore {
        constructor() {
            this.texts = {};
        }

        /**
         * Добавляет текст в хранилище
         * @param {HTMLElement} t
         */
        add(t) {
            let text = new Text(t);

            this.texts[text.id] = text;
        }

        /**
         * Проверяет, есть ли этот текст в хранилище
         * @param t
         * @return {boolean}
         */
        stored(t) {
            return !!t.__text_id;
        }

        /**
         * Возвращает объект-текст
         * @param t
         * @return {Text}
         */
        getTextByNode(t) {
            return this.texts[t.__text_id];
        }

        /**
         * Очищает хранилище от текстов, которых больше нет на странице
         */
        rinse() {
            // берем все текущие тексты на странице
            let textNodes = document.querySelectorAll('.wiki.text'),
                toRemove = [];

            // проходимся по всем текстам, которые сейчас есть в хранилище
            for (let id in this.texts) {
                if (this.texts.hasOwnProperty(id)) {
                    let found = false;

                    // ищем текст с таким id среди тех, что на странице
                    textNodes.forEach(t => {
                        if (t.__text_id === id) {
                            found = true;
                        }
                    });

                    // если не нашли, записываем в черный список
                    if (!found) {
                        toRemove.push(id);
                    }
                }
            }

            // удаляем неактуальные
            toRemove.forEach(id => delete this.texts[id]);
        }
    }


    // тут начинается самого выполнение скрипта
    // создадим хранилище наших комментов
    let textStore = new TextStore();

    // будем обновляться регулярно
    setInterval(() => {
        // каждый раз берем тексты заново, могли добавиться новые
        let textNodes = document.querySelectorAll('.wiki.text');

        textNodes.forEach(t => {
            // если это какой-то новый, добавляем в наш список
            if (!textStore.stored(t)) {
                textStore.add(t);
            }

            // обновляем текст
            textStore
                .getTextByNode(t)
                .update();
        });

        // удаляем старые
        textStore.rinse();
    }, 100);
})();