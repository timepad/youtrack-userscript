// ==UserScript==
// @name           YouTrack Checkboxes
// @description    Adds checkboxes functionality to YouTrack issues
// @version        1.0.0
// @namespace      https://github.com/timepad/youtrack-userscript
// @downloadURL    https://github.com/timepad/youtrack-userscript/raw/master/youtrack.checkboxes.user.js
// @updateURL      https://github.com/timepad/youtrack-userscript/raw/master/youtrack.checkboxes.user.js
// @include        https://timepad.myjetbrains.com/youtrack/issue/*
// @grant          none
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
            } else if (this.text.commentPreview) {
                // обновляем текст в textarea
                let textarea = Helper.getCommentPreviewTextarea(this.text.node);

                textarea.value = this.text.plainText;
            } else if (this.text.descriptionPreview) {
                // обновляем текст в textarea
                let textarea = Helper.getDescriptionPreviewTextarea(this.text.node);
                
                textarea.value = this.text.plainText;
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
         * Инциализирует простым текстом без всякого HTML и наших приблуд
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
            // возможно текст добавлен, но еще не инициализирован
            if (!this.preparedHtml || !this.preparedText) {
                return;
            }

            this.prepareTextAndHtml();
            this.updateCheckboxText();
            this.updateVisibleText();
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
                // превью коммента (если его сейчас редактируют или создают новый)
                this.commentPreview = true;
            } else if (Helper.findAncestor(this.node, 'issue-preview__content')) {
                // превью описания тикета (если его сейчас редактируют)
                this.descriptionPreview = true;
            } else {
                // остается только коммент
                let commentRow = Helper.findAncestor(this.node, 'comment-row');

                if (commentRow) {
                    this.comment = true;

                    // тот id, под которым комментарий хранится в ютреке
                    this.commentId = commentRow.getAttribute('_id');
                } else {
                    console.error("Couldn't determine text type");
                }
            }
        }

        /**
         * Опеределяет, удален ли этот комментарий
         * @return {boolean}
         */
        isDeleted() {
            return this.node.parentElement.classList.contains('comment_deleted');
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

        /**
         * Добавляет текст в хранилище, получая его из объекта коммента, полученного с сервера
         * @param c
         */
        addFromCommentObject(c) {
            let node = Helper.getCommentNode(c);

            if (node) {
                let text = this.add(node);

                // запоминаем настоящий текст с сервера
                text.init(c.text);
            } else {
                console.error(`Couln't find corresponding node for comment ${c.id}`);
            }
        }

        /**
         * Добавляет текст в хранилище, с учетом того, что это описание тикета
         * @param description
         */
        addFromDescription(description) {
            let node = Helper.getDescriptionNode();

            if (node) {
                let text = this.add(node);

                text.init(description);
            } else {
                console.error(`Couln't find corresponding node for description`);
            }
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
     * Просто набор методов, которые никуда особо не подходят
     */
    class Helper {
        /**
         * По объекту, представляющему комментарий, пришедщий с сервера
         * находит соответствующую DOM-ноду
         * @param c
         * @return {HTMLElement}
         */
        static getCommentNode(c) {
            return document.querySelector(`[_id="${c.id}"] .wiki.text`);
        }

        /**
         * Находит на странице DOM-ноду описания тикета
         * @return {HTMLElement}
         */
        static getDescriptionNode() {
            return document.querySelector('.description .wiki.text');
        }

        /**
         * Возвращает textarea, где мы вводим текст, когда редактируем коммент
         * @param node
         * @return {HTMLElement}
         */
        static getCommentPreviewTextarea(node) {
            let commentPreview = this.findAncestor(node, 'comment-preview'),
                commentTextareaContainer = this.findSibling(commentPreview, 'comment-textarea-container');

            return commentTextareaContainer.querySelector('textarea');
        }

        /**
         * Возвращает textarea, где мы вводим текст, когда редактируем описание тикета
         *
         * @param node
         * @return {HTMLElement}
         */
        static getDescriptionPreviewTextarea(node) {
            let editContentBlock = this.findAncestor(node, 'edit-content__block');

            return editContentBlock.querySelector('.edit-issue-form__i__description');
        }

        /**
         * Находит среди родителей элемент, у которого есть класс cls
         * @param element
         * @param cls
         * @return {HTMLElement | null} - найденный элемент или null
         */
        static findAncestor(element, cls) {
            while ((element = element.parentElement) && !element.classList.contains(cls));

            return element;
        }

        /**
         * Находит среди сиблингов элемент, у которого есть класс cls
         * @param element
         * @param cls
         * @return {HTMLElement | null} - найденный элемент или null
         */
        static findSibling(element, cls) {
            element = element.parentElement;

            return element.querySelector(`.${cls}`);
        }
    }

    /**
     * Класс для работы с YouTrack API
     */
    class ApiClient {
        constructor() {
            let url = window.location.href,
                match = url.match(/issue\/(\w+-\d+)/);

            // если смогли понять, что за тикет
            if (match && match[1]) {
                let issue = match[1];

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
                    let summary = xhr.responseXML.querySelector('field[name="summary"] value'),
                        description = xhr.responseXML.querySelector('field[name="description"] value');

                    issue.summary = summary ? summary.innerHTML : '';
                    issue.description = description ? description.innerHTML : '';

                    // запоминаем, понадобится при сохранении описания
                    this.issue = issue;

                    // резолвим промис полученным тикетом
                    resolve(issue);
                };
            });
        }

        /**
         * Обновляет описание тикета на сервере
         * @param text
         */
        updateDescription(text) {
            let xhr = new XMLHttpRequest(),
                body = new FormData();

            body.append('summary', this.issue.summary);
            body.append('description', text);

            xhr.open('POST', this.baseUrl, true);
            xhr.send(body);

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
                let text = textStore.add(t);

                // есть 4 варианта:
                // 1. это превью комментария (нового или редактируемого)
                // 2. это превью изменения описания тикета
                // 3. это существующий коммент, который мы только что добавили или отредактировали
                // 4. это описание тикета, которое мы только что отредактировали

                if (text.commentPreview) {
                    let textarea = Helper.getCommentPreviewTextarea(t);

                    text.init(textarea.value);
                } else if (text.descriptionPreview) {
                    let textarea = Helper.getDescriptionPreviewTextarea(t);

                    text.init(textarea.value);
                } else if (text.comment) {
                    // появился новый коммент, нужно делать запрос к API
                    apiClient.getComments().then(
                        comments => {
                            let comment = comments.filter(c => c.id === text.commentId)[0];

                            // нашелся коммент с таким id
                            if (comment) {
                                text.init(comment.text);
                            } else if (!text.isDeleted()) {
                                // если не нашелся, возможно он был удален
                                // тогда нода есть, но API его не вернет
                                // но в нем галочек все равно нет, поэтому ничего не делаем

                                // а если просто по каким-то причинам не нашелся, то выведем ошибку
                                console.error(`Couln't find comment "${text.commentId}"`);
                            }
                        },
                        error => console.error(error)
                    );
                } else if (text.description) {
                    // мы отредактировали описание, придется загрузить его заново
                    apiClient.getIssue().then(
                        issue => text.init(issue.description),
                        error => console.error(error)
                    );
                }
            }

            // обновляем текст
            textStore
                .getTextByNode(t)
                .update();
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