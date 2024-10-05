const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { InlineKeyboardButton, InlineKeyboardMarkup } = require('node-telegram-bot-api');
const { setTimeout } = require('timers/promises');

let config;
let user_api_keys;

try {
    const data = fs.readFileSync('config.json', 'utf8');
    config = JSON.parse(data);
    console.log("Конфигурация загружена!");
} catch (err) {
    console.error("Ошибка при загрузке конфигурации:", err);
}

try {
    const data = fs.readFileSync('apikeys.json', 'utf8');
    user_api_keys = JSON.parse(data);
    console.log("API ключи загружены!");
} catch (err) {
    console.error("apikeys.json не найден!", err);
    process.exit(1);
}

const bot = new TelegramBot(config.bot_token, { polling: true });

function get_api_key(user_id) {
    return user_api_keys[user_id] || null;
}

function add_api_key(user_id, api_key) {
    user_api_keys[user_id] = api_key;
    fs.writeFileSync('apikeys.json', JSON.stringify(user_api_keys, null, 2));
}

function remove_api_key(user_id) {
    delete user_api_keys[user_id];
    fs.writeFileSync('apikeys.json', JSON.stringify(user_api_keys, null, 2));
}

function validate_api_key(api_key) {
    return api_key.startsWith('ptlc_') && api_key.length === 48;
}

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `Здравствуйте, Вас приветствует бот ${config.title}!\nС его помощью вы легко сможете управлять сервером без посещения сайта.`);
});

bot.onText(/\/account/, (msg) => {
    const user_id = msg.from.id;
    send_or_edit_account_message(msg.chat.id, msg.message_id, user_id);
});

function send_or_edit_account_message(chat_id, message_id, user_id) {
    const api_key = get_api_key(user_id);
    if (!api_key) {
        bot.sendMessage(chat_id, "API ключ не установлен.");
        return;
    }

    axios.get(`${config.panel_url}/api/client/account`, {
        headers: {
            "Authorization": `Bearer ${api_key}`,
            "Accept": "application/json"
        }
    }).then(response => {
        const data = response.data.attributes || {};
        const user_id = data.id || 'N/A';
        const is_admin = data.admin || false;
        const username = data.username || 'N/A';
        const email = data.email || 'N/A';
        const first_name = data.first_name || 'N/A';
        const last_name = data.last_name || 'N/A';

        const admin_status = is_admin ? "Да" : "Нет";
        const response_text = (
            `ID: ${user_id}\n` +
            `Вы админ? ${admin_status}\n` +
            `Имя пользователя: ${username}\n` +
            `Электронная почта: ${email}\n` +
            `Имя: ${first_name} ${last_name}`
        );

        bot.editMessageText(response_text, { chat_id, message_id }).catch(err => {
            if (err.description.includes("message can't be edited")) {
                bot.sendMessage(chat_id, response_text);
            }
        });
    }).catch(error => {
        bot.sendMessage(chat_id, `Ошибка при получении информации об аккаунте: ${error.response.status}`);
    });
}

bot.onText(/\/profile/, (msg) => {
    const user_id = msg.from.id;
    send_or_edit_profile_message(msg.chat.id, msg.message_id, user_id);
});

function send_or_edit_profile_message(chat_id, message_id, user_id) {
    const api_key = get_api_key(user_id);

    let response, button_text, callback_data;
    if (api_key) {
        response = `Ваш ID: ${user_id}\nТекущий API токен: ${api_key}`;
        button_text = "Удалить API ключ";
        callback_data = 'remove_api_key';
    } else {
        response = `Ваш ID: ${user_id}\nТекущий API токен: Не указан`;
        button_text = "Добавить API ключ";
        callback_data = 'add_api_key';
    }

    const markup = new InlineKeyboardMarkup().add(new InlineKeyboardButton(button_text, { callback_data }));

    bot.editMessageText(response, { chat_id, message_id, reply_markup: markup }).catch(err => {
        if (err.description.includes("message can't be edited")) {
            bot.sendMessage(chat_id, response, { reply_markup: markup });
        }
    });
}

bot.onText(/\/servers/, (msg) => {
    const user_id = msg.from.id;
    send_or_edit_servers_message(msg.chat.id, msg.message_id, user_id);
});

function send_or_edit_servers_message(chat_id, message_id, user_id) {
    const api_key = get_api_key(user_id);

    if (!api_key) {
        bot.editMessageText("API ключ не установлен. Пожалуйста, добавьте API ключ с помощью команды /profile.", { chat_id, message_id }).catch(err => {
            if (err.description.includes("message can't be edited")) {
                bot.sendMessage(chat_id, "API ключ не установлен. Пожалуйста, добавьте API ключ с помощью команды /profile.");
            }
        });
        return;
    }

    axios.get(`${config.panel_url}/api/client`, {
        headers: {
            "Authorization": `Bearer ${api_key}`,
            "Accept": "application/json"
        }
    }).then(response => {
        const data = response.data;
        const servers = data.data || [];
        const server_count = servers.length;
        const response_message = `Всего доступных серверов: ${server_count}\n`;

        const markup = new InlineKeyboardMarkup();
        servers.forEach(server => {
            const attributes = server.attributes || {};
            const server_id = attributes.identifier || 'N/A';
            const server_name = attributes.name || 'N/A';
            const button_text = `${server_name} (${server_id})`;
            const button = new InlineKeyboardButton(button_text, { callback_data: `server_${server_id}` });
            markup.add(button);
        });

        bot.editMessageText(response_message, { chat_id, message_id, reply_markup: markup }).catch(err => {
            if (err.description.includes("message can't be edited")) {
                bot.sendMessage(chat_id, response_message, { reply_markup: markup });
            }
        });
    }).catch(error => {
        bot.editMessageText(`Ошибка при получении данных о серверах: ${error.response.status}`, { chat_id, message_id }).catch(err => {
            if (err.description.includes("message can't be edited")) {
                bot.sendMessage(chat_id, `Ошибка при получении данных о серверах: ${error.response.status}`);
            }
        });
    });
}

bot.on('callback_query', (callbackQuery) => {
    const user_id = callbackQuery.from.id;
    const data = callbackQuery.data;

    if (data === 'add_api_key') {
        bot.sendMessage(callbackQuery.message.chat.id, "Пожалуйста, введите ваш API ключ:").then(msg => {
            bot.onReplyToMessage(callbackQuery.message.chat.id, msg.message_id, process_api_key_step);
        });
    } else if (data === 'remove_api_key') {
        remove_api_key(user_id);
        bot.answerCallbackQuery(callbackQuery.id, { text: "API ключ удален." });
        send_or_edit_profile_message(callbackQuery.message.chat.id, callbackQuery.message.message_id, user_id);
    } else if (data === 'back_to_servers') {
        send_or_edit_servers_message(callbackQuery.message.chat.id, callbackQuery.message.message_id, user_id);
    } else if (data.startsWith('server_')) {
        const parts = data.split('_');
        const server_id = parts[1];
        const action = parts[2];

        if (!action) {
            server_callback(callbackQuery, server_id);
        } else if (action === "info") {
            send_server_info(callbackQuery, server_id, user_id);
        } else if (action === "resources") {
            send_server_resources(callbackQuery, server_id, user_id);
        } else if (["start", "restart", "stop", "kill"].includes(action)) {
            send_power_action(callbackQuery, server_id, user_id, action);
        } else if (action === "command") {
            prompt_for_command(callbackQuery, server_id);
        } else if (action === "rename") {
            prompt_for_rename(callbackQuery, server_id);
        }
    }
});

function server_callback(callbackQuery, server_id) {
    const actions = [
        ["Информация", "info"],
        ["Использование ресурсов", "resources"],
        ["Запуск", "start"],
        ["Рестарт", "restart"],
        ["Выключить", "stop"],
        ["Сроч. выкл.", "kill"],
        ["Команда", "command"],
        ["Переименовать", "rename"]
    ];

    const markup = new InlineKeyboardMarkup();
    actions.forEach(([action_text, action_code]) => {
        const button = new InlineKeyboardButton(action_text, { callback_data: `server_${server_id}_${action_code}` });
        markup.add(button);
    });

    const back_button = new InlineKeyboardButton("Вернуться", { callback_data: "back_to_servers" });
    markup.add(back_button);

    bot.editMessageText("Выберите действие:", { chat_id: callbackQuery.message.chat.id, message_id: callbackQuery.message.message_id, reply_markup: markup }).catch(err => {
        if (err.description.includes("message can't be edited")) {
            bot.sendMessage(callbackQuery.message.chat.id, "Выберите действие:", { reply_markup: markup });
        }
    });
}

function translate_status(status) {
    const translations = {
        "starting": "Запуск",
        "running": "Запущен",
        "stopping": "Выключение",
        "offline": "Выключен",
        "installing": "Установка",
        "install_failed": "Ошибка установки",
        "suspended": "Приостановлен",
        "restoring_backup": "Восстановление"
    };
    return translations[status] || status;
}

function send_server_resources(callbackQuery, server_id, user_id) {
    const api_key = get_api_key(user_id);
    if (!api_key) {
        bot.sendMessage(callbackQuery.message.chat.id, "API ключ не установлен.");
        return;
    }

    axios.get(`${config.panel_url}/api/client/servers/${server_id}/resources`, {
        headers: {
            "Authorization": `Bearer ${api_key}`,
            "Accept": "application/json"
        }
    }).then(response => {
        const data = response.data.attributes || {};
        const current_state = data.current_state || 'N/A';
        const translated_state = translate_status(current_state);
        const resources = data.resources || {};

        const memory_bytes = resources.memory_bytes || 0;
        const memory_mb = memory_bytes / (1024 * 1024);
        const disk_bytes = resources.disk_bytes || 0;
        const disk_mb = disk_bytes / (1024 * 1024);
        const cpu_absolute = resources.cpu_absolute || 0.0;

        const response_message = (
            `Статус сервера: ${translated_state}\n` +
            `ОЗУ сервера: ${memory_mb} МБ\n` +
            `Диск сервера: ${disk_mb} МБ\n` +
            `ЦПУ сервера: ${cpu_absolute}%`
        );

        bot.sendMessage(callbackQuery.message.chat.id, response_message);
    }).catch(error => {
        bot.sendMessage(callbackQuery.message.chat.id, `Ошибка при получении информации о ресурсах сервера: ${error.response.status}`);
    });
}

function send_server_info(callbackQuery, server_id, user_id) {
    const api_key = get_api_key(user_id);
    if (!api_key) {
        bot.sendMessage(callbackQuery.message.chat.id, "API ключ не установлен.");
        return;
    }

    axios.get(`${config.panel_url}/api/client/servers/${server_id}`, {
        headers: {
            "Authorization": `Bearer ${api_key}`,
            "Accept": "application/json"
        }
    }).then(response => {
        const data = response.data.attributes || {};

        const server_name = data.name || 'N/A';
        const owner = data.server_owner ? "Да" : "Нет";
        const uuid = data.uuid || 'N/A';
        const description = data.description || 'N/A';
        const cpu = data.limits?.cpu || 'N/A';
        const memory = data.limits?.memory || 'N/A';
        const disk = data.limits?.disk || 'N/A';
        const databases = data.feature_limits?.databases || 'N/A';
        const allocations = data.feature_limits?.allocations || 'N/A';
        const backups = data.feature_limits?.backups || 'N/A';
        const sftp_details = data.sftp_details || {};
        const sftp_ip = sftp_details.ip || 'N/A';
        const sftp_port = sftp_details.port || 'N/A';
        const node = data.node || 'N/A';
        const suspended = data.is_suspended ? "Да" : "Нет";
        const installing = data.is_installing ? "Да" : "Нет";

        const response_message = (
            `Имя сервера: ${server_name}\n` +
            `Вы владелец? ${owner}\n` +
            `UUID сервера: ${uuid}\n` +
            `Описание сервера: ${description}\n` +
            `ЦПУ сервера: ${cpu}%\n` +
            `ОЗУ сервера: ${memory} МБ\n` +
            `Диск сервера: ${disk} МБ\n` +
            `Кол-во баз данных: ${databases}\n` +
            `Кол-во мест: ${allocations}\n` +
            `Кол-во бекапов: ${backups}\n` +
            `SFTP сервера: ${sftp_ip}:${sftp_port}\n` +
            `Узел: ${node}\n` +
            `Приостановлен: ${suspended}\n` +
            `Устанавливается: ${installing}`
        );

        bot.sendMessage(callbackQuery.message.chat.id, response_message);
    }).catch(error => {
        bot.sendMessage(callbackQuery.message.chat.id, `Ошибка при получении информации о сервере: ${error.response.status}`);
    });
}

function send_power_action(callbackQuery, server_id, user_id, action) {
    const api_key = get_api_key(user_id);
    if (!api_key) {
        bot.sendMessage(callbackQuery.message.chat.id, "API ключ не установлен.");
        return;
    }

    const valid_actions = ['start', 'restart', 'stop', 'kill'];
    if (!valid_actions.includes(action)) {
        bot.sendMessage(callbackQuery.message.chat.id, "Недопустимое действие.");
        return;
    }

    axios.post(`${config.panel_url}/api/client/servers/${server_id}/power`, { signal: action }, {
        headers: {
            "Authorization": `Bearer ${api_key}`,
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
    }).then(response => {
        if (response.status === 204) {
            bot.sendMessage(callbackQuery.message.chat.id, `Команда '${action}' успешно выполнена.`);
        } else {
            bot.sendMessage(callbackQuery.message.chat.id, `Ошибка при выполнении команды '${action}': ${response.status}`);
        }
    }).catch(error => {
        bot.sendMessage(callbackQuery.message.chat.id, `Произошла ошибка при запросе: ${error}`);
    });
}

function prompt_for_command(callbackQuery, server_id) {
    bot.sendMessage(callbackQuery.message.chat.id, "Пожалуйста, введите команду для отправки на сервер:").then(msg => {
        setTimeout(15000).then(() => timeout(msg.chat.id, msg.message_id));
        bot.onReplyToMessage(callbackQuery.message.chat.id, msg.message_id, (message) => process_command_input(message, server_id, callbackQuery.from.id, msg.message_id));
    });
}

function process_command_input(message, server_id, user_id, command_msg_id) {
    const command = message.text;
    if (command) {
        send_command(message, server_id, user_id, command, command_msg_id);
    } else {
        bot.sendMessage(message.chat.id, "Команда не может быть пустой.");
        prompt_for_command(message, server_id);
    }
}

function send_command(message, server_id, user_id, command, command_msg_id) {
    const api_key = get_api_key(user_id);
    if (!api_key) {
        bot.sendMessage(message.chat.id, "API ключ не установлен.");
        return;
    }

    axios.post(`${config.panel_url}/api/client/servers/${server_id}/command`, { command }, {
        headers: {
            "Authorization": `Bearer ${api_key}`,
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
    }).then(response => {
        bot.deleteMessage(message.chat.id, command_msg_id);

        if (response.status === 204) {
            bot.sendMessage(message.chat.id, `Команда '${command}' успешно отправлена.`);
        } else {
            bot.sendMessage(message.chat.id, `Ошибка при отправке команды '${command}': ${response.status}`);
        }
    }).catch(error => {
        bot.sendMessage(message.chat.id, `Произошла ошибка при запросе: ${error}`);
    });
}

function prompt_for_rename(callbackQuery, server_id) {
    bot.sendMessage(callbackQuery.message.chat.id, "Пожалуйста, введите новое имя для сервера:").then(msg => {
        setTimeout(15000).then(() => timeout(msg.chat.id, msg.message_id));
        bot.onReplyToMessage(callbackQuery.message.chat.id, msg.message_id, (message) => process_rename_input(message, server_id, callbackQuery.from.id, msg.message_id));
    });
}

function process_rename_input(message, server_id, user_id, rename_msg_id) {
    const new_name = message.text;
    if (new_name) {
        rename_server(message, server_id, user_id, new_name, rename_msg_id);
    } else {
        bot.sendMessage(message.chat.id, "Имя не может быть пустым.");
        prompt_for_rename(message, server_id);
    }
}

function rename_server(message, server_id, user_id, new_name, rename_msg_id) {
    const api_key = get_api_key(user_id);
    if (!api_key) {
        bot.sendMessage(message.chat.id, "API ключ не установлен.");
        return;
    }

    axios.post(`${config.panel_url}/api/client/servers/${server_id}/settings/rename`, { name: new_name }, {
        headers: {
            "Authorization": `Bearer ${api_key}`,
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
    }).then(response => {
        bot.deleteMessage(message.chat.id, rename_msg_id);

        if (response.status === 204) {
            bot.sendMessage(message.chat.id, `Сервер успешно переименован в '${new_name}'.`);
        } else {
            bot.sendMessage(message.chat.id, `Ошибка при переименовании сервера: ${response.status}`);
        }
    }).catch(error => {
        bot.sendMessage(message.chat.id, `Произошла ошибка при запросе: ${error}`);
    });
}

function timeout(chat_id, message_id) {
    bot.sendMessage(chat_id, "Время ожидания истекло.").then(() => {
        bot.deleteMessage(chat_id, message_id);
    }).catch(err => {
        console.error(`Ошибка при удалении сообщения: ${err}`);
    });
}

function process_api_key_step(message, user_id, message_id) {
    const api_key = message.text;
    if (validate_api_key(api_key)) {
        add_api_key(user_id, api_key);
        bot.sendMessage(message.chat.id, "API ключ успешно добавлен!");
    } else {
        bot.sendMessage(message.chat.id, "Неверный API ключ. Попробуйте снова.");
    }
    send_or_edit_profile_message(message.chat.id, message_id, user_id);
}

console.log("Бот успешно запущен!");
console.log("Дискорд: mcgamer.jar");