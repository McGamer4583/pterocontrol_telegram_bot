import json
import telebot
import requests
from telebot import types
import threading

with open('config.json', 'r') as f:
    print("Загрузка конфигурации...")
    config = json.load(f)
    print("Конфигурация загружена!")

bot = telebot.TeleBot(config['bot_token'])

try:
    with open('apikeys.json', 'r') as f:
        print("Загрузка API ключей...")
        user_api_keys = json.load(f)
        print("API ключи загружены!")
except FileNotFoundError:
    print("apikeys.json не найден!")
    stop_polling()

def get_api_key(user_id):
    return user_api_keys.get(str(user_id), None)

def add_api_key(user_id, api_key):
    user_api_keys[str(user_id)] = api_key
    with open('apikeys.json', 'w') as f:
        json.dump(user_api_keys, f)

def remove_api_key(user_id):
    user_api_keys.pop(str(user_id), None)
    with open('apikeys.json', 'w') as f:
        json.dump(user_api_keys, f)

def validate_api_key(api_key):
    return api_key.startswith('ptlc_') and len(api_key) == 48

@bot.message_handler(commands=['start'])
def send_welcome(message):
    bot.reply_to(message, f"Здравствуйте, Вас приветствует бот {config['title']}!\nС его помощью вы легко сможете управлять сервером без посещения сайта.")

@bot.message_handler(commands=['account'])
def send_account_info(message):
    user_id = message.from_user.id
    send_or_edit_account_message(message.chat.id, message.message_id, user_id)

def send_or_edit_account_message(chat_id, message_id, user_id):
    api_key = get_api_key(user_id)
    if not api_key:
        bot.send_message(chat_id, "API ключ не установлен.")
        return

    try:
        url = f"{config['panel_url']}/api/client/account"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json"
        }
        response = requests.get(url, headers=headers)

        if response.status_code == 200:
            data = response.json().get("attributes", {})
            user_id = data.get('id', 'N/A')
            is_admin = data.get('admin', False)
            username = data.get('username', 'N/A')
            email = data.get('email', 'N/A')
            first_name = data.get('first_name', 'N/A')
            last_name = data.get('last_name', 'N/A')

            admin_status = "Да" if is_admin else "Нет"
            response_text = (
                f"ID: {user_id}\n"
                f"Вы админ? {admin_status}\n"
                f"Имя пользователя: {username}\n"
                f"Электронная почта: {email}\n"
                f"Имя: {first_name} {last_name}"
            )

            try:
                bot.edit_message_text(response_text, chat_id, message_id)
            except telebot.apihelper.ApiTelegramException as e:
                if "message can't be edited" in str(e):
                    bot.send_message(chat_id, response_text)
        else:
            bot.send_message(chat_id, f"Ошибка при получении информации об аккаунте: {response.status_code}")
    except requests.RequestException as e:
        bot.send_message(chat_id, f"Произошла ошибка при запросе: {e}")

@bot.message_handler(commands=['profile'])
def send_profile(message):
    user_id = message.from_user.id
    send_or_edit_profile_message(message.chat.id, message.message_id, user_id)

def send_or_edit_profile_message(chat_id, message_id, user_id):
    api_key = get_api_key(user_id)

    if api_key:
        response = (
            f"Ваш ID: {user_id}\n"
            f"Текущий API токен: {api_key}"
        )
        button_text = "Удалить API ключ"
        callback_data = 'remove_api_key'
    else:
        response = (
            f"Ваш ID: {user_id}\n"
            "Текущий API токен: Не указан"
        )
        button_text = "Добавить API ключ"
        callback_data = 'add_api_key'

    markup = telebot.types.InlineKeyboardMarkup()
    button = telebot.types.InlineKeyboardButton(button_text, callback_data=callback_data)
    markup.add(button)

    try:
        bot.edit_message_text(response, chat_id, message_id, reply_markup=markup)
    except telebot.apihelper.ApiTelegramException as e:
        if "message can't be edited" in str(e):
            bot.send_message(chat_id, response, reply_markup=markup)

@bot.message_handler(commands=['servers'])
def send_servers(message):
    user_id = message.from_user.id
    send_or_edit_servers_message(message.chat.id, message.message_id, user_id)

def send_or_edit_servers_message(chat_id, message_id, user_id):
    api_key = get_api_key(user_id)

    if not api_key:
        bot.edit_message_text("API ключ не установлен. Пожалуйста, добавьте API ключ с помощью команды /profile.", chat_id, message_id)
        return

    try:
        url = f"{config['panel_url']}/api/client"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json"
        }
        response = requests.get(url, headers=headers)

        if response.status_code == 200:
            data = response.json()
            servers = data.get("data", [])
            server_count = len(servers)
            response_message = f"Всего доступных серверов: {server_count}\n"

            markup = telebot.types.InlineKeyboardMarkup()
            for server in servers:
                attributes = server.get("attributes", {})
                server_id = attributes.get("identifier", "N/A")
                server_name = attributes.get("name", "N/A")
                button_text = f"{server_name} ({server_id})"
                button = telebot.types.InlineKeyboardButton(button_text, callback_data=f"server_{server_id}")
                markup.add(button)

            try:
                bot.edit_message_text(response_message, chat_id, message_id, reply_markup=markup)
            except telebot.apihelper.ApiTelegramException as e:
                if "message can't be edited" in str(e):
                    bot.send_message(chat_id, response_message, reply_markup=markup)
        else:
            bot.edit_message_text(f"Ошибка при получении данных о серверах: {response.status_code}", chat_id, message_id)
    except requests.RequestException as e:
        bot.edit_message_text(f"Произошла ошибка при запросе: {e}", chat_id, message_id)

@bot.callback_query_handler(func=lambda callback: True)
def callback_inline(callback):
    user_id = callback.from_user.id

    if callback.data == 'add_api_key':
        msg = bot.send_message(callback.message.chat.id, "Пожалуйста, введите ваш API ключ:")
        bot.register_next_step_handler(msg, process_api_key_step, user_id, callback.message.message_id)
    elif callback.data == 'remove_api_key':
        remove_api_key(user_id)
        bot.answer_callback_query(callback.id, "API ключ удален.")
        send_or_edit_profile_message(callback.message.chat.id, callback.message.message_id, user_id)
    elif callback.data == 'back_to_servers':
        send_or_edit_servers_message(callback.message.chat.id, callback.message.message_id, user_id)
    elif callback.data.startswith('server_'):
        parts = callback.data.split('_')
        server_id = parts[1]
        action = parts[2] if len(parts) > 2 else None

        if action is None:
            server_callback(callback)
        elif action == "info":
            send_server_info(callback, server_id, user_id)
        elif action == "resources":
            send_server_resources(callback, server_id, user_id)
        elif action in ["start", "restart", "stop", "kill"]:
            send_power_action(callback, server_id, user_id, action)
        elif action == "command":
            prompt_for_command(callback, server_id)
        elif action == "rename":
            prompt_for_rename(callback, server_id)

def server_callback(callback):
    server_id = callback.data.split('_')[1]

    markup = telebot.types.InlineKeyboardMarkup()
    actions = [
        ("Информация", "info"),
        ("Использование ресурсов", "resources"),
        ("Запуск", "start"),
        ("Рестарт", "restart"),
        ("Выключить", "stop"),
        ("Сроч. выкл.", "kill"),
        ("Команда", "command"),
        ("Переименовать", "rename")
    ]

    for action_text, action_code in actions:
        callback_data = f"server_{server_id}_{action_code}"
        button = telebot.types.InlineKeyboardButton(action_text, callback_data=callback_data)
        markup.add(button)

    back_button = telebot.types.InlineKeyboardButton("Вернуться", callback_data="back_to_servers")
    markup.add(back_button)

    try:
        bot.edit_message_text("Выберите действие:", callback.message.chat.id, callback.message.message_id, reply_markup=markup)
    except telebot.apihelper.ApiTelegramException as e:
        if "message can't be edited" in str(e):
            bot.send_message(callback.message.chat.id, "Выберите действие:", reply_markup=markup)

def translate_status(status):
    translations = {
        "starting": "Запуск",
        "running": "Запущен",
        "stopping": "Выключение",
        "offline": "Выключен",
        "installing": "Установка",
        "install_failed": "Ошибка установки",
        "suspended": "Приостановлен",
        "restoring_backup": "Восстановление"
    }
    return translations.get(status, status)

def send_server_resources(callback, server_id, user_id):
    api_key = get_api_key(user_id)
    if not api_key:
        bot.send_message(callback.message.chat.id, "API ключ не установлен.")
        return

    try:
        url = f"{config['panel_url']}/api/client/servers/{server_id}/resources"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json"
        }
        response = requests.get(url, headers=headers)

        if response.status_code == 200:
            data = response.json().get("attributes", {})
            current_state = data.get("current_state", "N/A")
            translated_state = translate_status(current_state)
            resources = data.get("resources", {})

            memory_bytes = resources.get("memory_bytes", 0)
            memory_mb = memory_bytes // (1024 * 1024)
            disk_bytes = resources.get("disk_bytes", 0)
            disk_mb = disk_bytes // (1024 * 1024)
            cpu_absolute = resources.get("cpu_absolute", 0.0)

            response_message = (
                f"Статус сервера: {translated_state}\n"
                f"ОЗУ сервера: {memory_mb} МБ\n"
                f"Диск сервера: {disk_mb} МБ\n"
                f"ЦПУ сервера: {cpu_absolute}%"
            )

            bot.send_message(callback.message.chat.id, response_message)
        else:
            bot.send_message(callback.message.chat.id, f"Ошибка при получении информации о ресурсах сервера: {response.status_code}")
    except requests.RequestException as e:
        bot.send_message(callback.message.chat.id, f"Произошла ошибка при запросе: {e}")

def send_server_info(callback, server_id, user_id):
    api_key = get_api_key(user_id)
    if not api_key:
        bot.send_message(callback.message.chat.id, "API ключ не установлен.")
        return

    try:
        url = f"{config['panel_url']}/api/client/servers/{server_id}"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json"
        }
        response = requests.get(url, headers=headers)

        if response.status_code == 200:
            data = response.json().get("attributes", {})
            
            server_name = data.get("name", "N/A")
            owner = "Да" if data.get("server_owner", False) else "Нет"
            uuid = data.get("uuid", "N/A")
            description = data.get("description", "N/A")
            cpu = data.get("limits", {}).get("cpu", "N/A")
            memory = data.get("limits", {}).get("memory", "N/A")
            disk = data.get("limits", {}).get("disk", "N/A")
            databases = data.get("feature_limits", {}).get("databases", "N/A")
            allocations = data.get("feature_limits", {}).get("allocations", "N/A")
            backups = data.get("feature_limits", {}).get("backups", "N/A")
            sftp_details = data.get("sftp_details", {})
            sftp_ip = sftp_details.get("ip", "N/A")
            sftp_port = sftp_details.get("port", "N/A")
            node = data.get("node", "N/A")
            suspended = "Да" if data.get("is_suspended", False) else "Нет"
            installing = "Да" if data.get("is_installing", False) else "Нет"

            response_message = (
                f"Имя сервера: {server_name}\n"
                f"Вы владелец? {owner}\n"
                f"UUID сервера: {uuid}\n"
                f"Описание сервера: {description}\n"
                f"ЦПУ сервера: {cpu}%\n"
                f"ОЗУ сервера: {memory} МБ\n"
                f"Диск сервера: {disk} МБ\n"
                f"Кол-во баз данных: {databases}\n"
                f"Кол-во мест: {allocations}\n"
                f"Кол-во бекапов: {backups}\n"
                f"SFTP сервера: {sftp_ip}:{sftp_port}\n"
                f"Узел: {node}\n"
                f"Приостановлен: {suspended}\n"
                f"Устанавливается: {installing}"
            )

            bot.send_message(callback.message.chat.id, response_message)
        else:
            bot.send_message(callback.message.chat.id, f"Ошибка при получении информации о сервере: {response.status_code}")
    except requests.RequestException as e:
        bot.send_message(callback.message.chat.id, f"Произошла ошибка при запросе: {e}")

def send_power_action(callback, server_id, user_id, action):
    api_key = get_api_key(user_id)
    if not api_key:
        bot.send_message(callback.message.chat.id, "API ключ не установлен.")
        return

    valid_actions = ['start', 'restart', 'stop', 'kill']
    if action not in valid_actions:
        bot.send_message(callback.message.chat.id, "Недопустимое действие.")
        return

    try:
        url = f"{config['panel_url']}/api/client/servers/{server_id}/power"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
        payload = {"signal": action}
        response = requests.post(url, json=payload, headers=headers)

        if response.status_code == 204:
            bot.send_message(callback.message.chat.id, f"Команда '{action}' успешно выполнена.")
        else:
            bot.send_message(callback.message.chat.id, f"Ошибка при выполнении команды '{action}': {response.status_code}")
    except requests.RequestException as e:
        bot.send_message(callback.message.chat.id, f"Произошла ошибка при запросе: {e}")

def prompt_for_command(callback, server_id):
    msg = bot.send_message(callback.message.chat.id, "Пожалуйста, введите команду для отправки на сервер:")
    timer = threading.Timer(15.0, timeout, args=(msg.chat.id, msg.message_id))
    timer.start()
    bot.register_next_step_handler(msg, process_command_input, server_id, callback.from_user.id, msg.message_id, timer)

def process_command_input(message, server_id, user_id, command_msg_id, timer):
    timer.cancel()
    command = message.text
    if command:
        send_command(message, server_id, user_id, command, command_msg_id)
    else:
        bot.send_message(message.chat.id, "Команда не может быть пустой.")
        prompt_for_command(message, server_id)

def send_command(message, server_id, user_id, command, command_msg_id):
    api_key = get_api_key(user_id)
    if not api_key:
        bot.send_message(message.chat.id, "API ключ не установлен.")
        return

    try:
        url = f"{config['panel_url']}/api/client/servers/{server_id}/command"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
        payload = {"command": command}
        response = requests.post(url, json=payload, headers=headers)

        bot.delete_message(message.chat.id, command_msg_id)

        if response.status_code == 204:
            bot.send_message(message.chat.id, f"Команда '{command}' успешно отправлена.")
        else:
            bot.send_message(message.chat.id, f"Ошибка при отправке команды '{command}': {response.status_code}")
    except requests.RequestException as e:
        bot.send_message(message.chat.id, f"Произошла ошибка при запросе: {e}")

def prompt_for_rename(callback, server_id):
    msg = bot.send_message(callback.message.chat.id, "Пожалуйста, введите новое имя для сервера:")
    timer = threading.Timer(15.0, timeout, args=(msg.chat.id, msg.message_id))
    timer.start()
    bot.register_next_step_handler(msg, process_rename_input, server_id, callback.from_user.id, msg.message_id, timer)

def process_rename_input(message, server_id, user_id, rename_msg_id, timer):
    timer.cancel()
    new_name = message.text
    if new_name:
        rename_server(message, server_id, user_id, new_name, rename_msg_id)
    else:
        bot.send_message(message.chat.id, "Имя не может быть пустым.")
        prompt_for_rename(message, server_id)

def rename_server(message, server_id, user_id, new_name, rename_msg_id):
    api_key = get_api_key(user_id)
    if not api_key:
        bot.send_message(message.chat.id, "API ключ не установлен.")
        return

    try:
        url = f"{config['panel_url']}/api/client/servers/{server_id}/settings/rename"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
        payload = {"name": new_name}
        response = requests.post(url, json=payload, headers=headers)

        bot.delete_message(message.chat.id, rename_msg_id)

        if response.status_code == 204:
            bot.send_message(message.chat.id, f"Сервер успешно переименован в '{new_name}'.")
        else:
            bot.send_message(message.chat.id, f"Ошибка при переименовании сервера: {response.status_code}")
    except requests.RequestException as e:
        bot.send_message(message.chat.id, f"Произошла ошибка при запросе: {e}")

def timeout(chat_id, message_id):
    try:
        bot.send_message(chat_id, "Время ожидания истекло.")
        bot.delete_message(chat_id, message_id)
    except Exception as e:
        print(f"Ошибка при удалении сообщения: {e}")

def process_api_key_step(message, user_id, message_id):
    api_key = message.text
    if validate_api_key(api_key):
        add_api_key(user_id, api_key)
        bot.send_message(message.chat.id, "API ключ успешно добавлен!")
    else:
        bot.send_message(message.chat.id, "Неверный API ключ. Попробуйте снова.")
    send_or_edit_profile_message(message.chat.id, message_id, user_id)

print("Бот успешно запущен!")
print("Дискорд: mcgamer.jar")
bot.polling(none_stop=True)
