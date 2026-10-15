# Alchemist

A voice-first personal AI assistant for Windows. Press Ctrl+Alt+A, say what
you want, and Alchemist opens apps, searches the web, and creates files.

## Install

    npm install -g alchemist
    alchemist setup
    alchemist start

Requires Windows 10/11 and Node.js 22 or newer.

## You will need

- An OpenRouter API key (https://openrouter.ai/keys), with a model that supports tool calling
- A Groq API key (https://console.groq.com) for speech recognition

## Usage

Press Ctrl+Alt+A and talk. Say "close chat" to dismiss the popup.

    alchemist setup    Change keys and settings
    alchemist stop     Quit the background app
    alchemist doctor   Check your configuration

## Privacy and safety

- Your voice is sent to Groq for transcription. Your text goes to OpenRouter.
- Keys are stored in plain text at %APPDATA%\alchemist\config.json.
- By default Alchemist asks before writing files or running commands.
  "Always allow" removes those prompts; speech recognition can mishear, so
  enable it only if you accept that risk.

## License

MIT