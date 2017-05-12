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
            let checked = this.node.checked,
                checkedString = `YT_CHECKBOX_${this.id}_CHECKED`,
                uncheckedString = `YT_CHECKBOX_${this.id}_UNCHECKED`;

            // обновляем наш подготовленный html
            this.text.preparedHtml = checked ?
                this.text.preparedHtml.replace(uncheckedString, checkedString) :
                this.text.preparedHtml.replace(checkedString, uncheckedString);

            // обновляем наш подготовленный текст
            this.text.preparedText = checked ?
                this.text.preparedText.replace(uncheckedString, checkedString) :
                this.text.preparedText.replace(checkedString, uncheckedString);

            // соответствующе обновляем plain-текст
            this.text.updatePlainText();

            if (this.text.comment) {
                // обновляем комментарий на сервере
                apiClient.updateComment(this.text.commentId, this.text.plainText);
            } else if (this.text.description) {
                // обновляем описание на сервере
                apiClient.updateDescription(this.text.plainText);
            }
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

            // определяем, это описание, превью или обычный комментарий
            this.determineTextType();

            // создаем пустое хранилище чекбоксов
            this.checkboxStore = new CheckboxStore();
        }

        /**
         *
         * @param {string} text
         */
        init(text) {
            this.plainText = text;
            this.preparedText = text;

            this.preparedHtml = this.node.innerHTML;
            this.checkboxHtml = this.node.innerHTML;

            // подготавливаем текст
            this.prepareTextAndHtml();
        }

        /**
         * Заменяет в тексте все _[ ] на строки вида YT_CHECKBOX_34f91ad6cce2_CHECKED
         * Работает в предположении, что количество таких строк в комменте с сервера и в innerHTML коммента в DOMе совпадает
         */
        prepareTextAndHtml() {
            let html = this.preparedHtml,
                text = this.preparedText;

            // заменяем unchecked галочки
            while (html.match(/_\[ ]/)) {
                // в html нашелся нераспарсенный чекбокс, скорее всего и в text он тоже есть
                // создаем новый
                let checkbox = new Checkbox(this),
                    checkboxString = `YT_CHECKBOX_${checkbox.id}_UNCHECKED`;

                // добавляем в хранилище
                this.checkboxStore.add(checkbox);

                // заменяем в html и тексте
                html = html.replace(/_\[ ]/, checkboxString);
                text = text.replace(/_\[ ]/, checkboxString);
            }

            // заменяем checked галочки
            // xх - латинский и кириллический
            while (html.match(/_\[[xх]]/)) {
                // в html нашелся нераспарсенный чекбокс, скорее всего и в text он тоже есть
                // создаем новый
                let checkbox = new Checkbox(this),
                    checkboxString = `YT_CHECKBOX_${checkbox.id}_CHECKED`;

                // добавляем в хранилище
                this.checkboxStore.add(checkbox);

                // заменяем в html и тексте
                html = html.replace(/_\[[xх]]/, checkboxString);
                text = text.replace(/_\[[xх]]/, checkboxString);
            }

            // сохраняем все наши изменения
            this.preparedHtml = html;
            this.preparedText = text;
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
            let text = this.preparedText,
                regexp = /YT_CHECKBOX_[0-9a-f]{12}_(UN)?CHECKED/,
                match;

            // заменяем на квадратные скобки
            while (match = text.match(regexp)) {
                if (match[1]) { // если есть приставка UN
                    text = text.replace(regexp, '_[ ]');
                } else {
                    text = text.replace(regexp, '_[x]');
                }
            }

            // сохраняем
            this.plainText = text;
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
            this.prepareTextAndHtml();
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
                    console.error("Couldn't determine text type");
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

            return text;
        }

        addFromCommentObject(c) {
            let node = this.getCorrespondingCommentNode(c);

            if (node) {
                let text = this.add(node);

                // запоминаем настоящий текст с сервера
                text.init(c.text);
            } else {
                console.error(`Couln't find corresponding node for comment ${c.id}`);
            }
        }

        addFromDescription(description) {
            let node = this.getDescriptionNode();

            if (node) {
                let text = this.add(node);

                text.init(description);
            } else {
                console.error(`Couln't find corresponding node for description`);
            }
        }

        /**
         * По объекту, представляющему комментарий, пришедщий с сервера
         * находит соответствующую dom-ноду
         * @param c
         * @return {HTMLElement}
         */
        getCorrespondingCommentNode(c) {
            return document.querySelector(`[_id="${c.id}"] .wiki.text`);
        }

        getDescriptionNode() {
            return document.querySelector('.description .wiki.text');
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

    /**
     * Класс для работы с YouTrack API
     */
    class ApiClient {
        constructor() {
            let url = window.location.href,
                match = url.match(/TP-\d+/);

            // если смогли понять, что за тикет
            if (match && match[0]) {
                let issue = match[0];

                this.baseUrl = `https://timepad.myjetbrains.com/youtrack/rest/issue/${issue}`;
            } else {
                console.error('Issue determining error');
            }
        }

        /**
         * С помощью API подгружает комменты
         * Нужно для того, чтобы получить их представление в youtrack-маркдауне
         * @return {Promise}
         */
        getComments() {
            // сразу возвращаем промис
            return new Promise((resolve, reject) => {
                let xhr = new XMLHttpRequest(),
                    comments = [];

                xhr.open('GET', `${this.baseUrl}/comment`, true);
                xhr.send();

                xhr.onload = () => {
                    // какая-то ошибка, ничего не поделать
                    if (xhr.status !== 200) {
                        let error = new Error(xhr.responseText);

                        error.code = xhr.status;

                        reject(error);
                    }

                    // если все ок, находим элементы <comment>
                    let commentNodes = xhr.responseXML.querySelectorAll('comment');

                    // заполним массив с комментами
                    commentNodes.forEach(c => comments.push({id: c.id, text: c.getAttribute('text')}));

                    // резолвим промис полученными комментами
                    resolve(comments);
                };
            });
        }

        /**
         * Обновляет комментарий на сервере
         * @param id
         * @param text
         */
        updateComment(id, text) {
            let xhr = new XMLHttpRequest(),
                body = JSON.stringify({text});

            xhr.open('PUT', `${this.baseUrl}/comment/${id}`, true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(body);

            xhr.onload = () => {
                if (xhr.status !== 200) {
                    console.error(xhr.responseText);
                }
            };
        }

        /**
         * Получает с сервера всю информацию о тикете
         * @return {Promise}
         */
        getIssue() {
            return new Promise((resolve, reject) => {
                let xhr = new XMLHttpRequest(),
                    issue = {
                        summary: '',
                        description: '',
                        comments: []
                    };

                xhr.open('GET', this.baseUrl, true);
                xhr.send();

                xhr.onload = () => {
                    // какая-то ошибка, ничего не поделать
                    if (xhr.status !== 200) {
                        let error = new Error(xhr.responseText);
                        error.code = xhr.status;

                        reject(error);
                    }

                    // заполним массив с комментами
                    xhr.responseXML
                        .querySelectorAll('comment')
                        .forEach(c => issue.comments.push({id: c.id, text: c.getAttribute('text')}));

                    // теперь находим summary и description
                    issue.summary = xhr.responseXML.querySelector('field[name="summary"] value').innerHTML;
                    issue.description = xhr.responseXML.querySelector('field[name="description"] value').innerHTML;

                    // запоминаем, понадобится при сохранении описания
                    this.issue = issue;

                    // резолвим промис полученным тикетом
                    resolve(issue);
                };
            });
        }

        updateDescription(text) {
            let xhr = new XMLHttpRequest();

            xhr.open('POST', `${this.baseUrl}?summary=${encodeURIComponent(this.issue.summary)}&description=${encodeURIComponent(text)}`, true);
            xhr.send();

            xhr.onload = () => {
                if (xhr.status !== 200) {
                    console.error(xhr.responseText);
                }
            };
        }
    }

    // тут начинается выполнение самого скрипта
    // создадим хранилище наших комментов
    let textStore = new TextStore(),
        apiClient = new ApiClient();

    // основная функция обновления текстов
    let updateTexts = () => {
        // берем тексты заново, могли добавиться новые
        let textNodes = document.querySelectorAll('.wiki.text');

        textNodes.forEach(t => {
            // если это какой-то новый, добавляем в наш список
            if (!textStore.stored(t)) {
                textStore.add(t);
            }

            // TODO пока что только для комментов и описания
            let text = textStore.getTextByNode(t);

            if (text.comment || text.description) {
                text.update();
            }

            // обновляем текст
            // textStore
            //     .getTextByNode(t)
            //     .update();
        });

        // удаляем старые
        textStore.rinse();
    };

    // подгрузим комменты
    apiClient.getIssue().then(
        issue => {
            // добавляем комменты
            issue.comments.forEach(c => textStore.addFromCommentObject(c));

            // добавляем описание
            textStore.addFromDescription(issue.description);

            // будем обновляться регулярно
            setInterval(updateTexts, 100);
        },
        error => console.error(error)
    );
})();