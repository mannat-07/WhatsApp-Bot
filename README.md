# WhatsApp AI Bot with Voice Messages

An intelligent WhatsApp bot powered by Google's Gemini 2.0 Flash AI that can respond to messages in both text and voice formats.  
[Output](https://drive.google.com/file/d/1hxFecKLKGq5LL5Clz2F9-ssqLH7VHZ_y/view?usp=sharing)

## Features

- 🤖 **AI-Powered Responses**: Uses Google Gemini 2.0 Flash for intelligent conversations
- 🎤 **Voice Messages**: Converts AI responses to voice notes using Windows Speech Synthesizer
- 💬 **Text Responses**: Responds with detailed text messages (5-8 sentences)
- 🧠 **Conversation Memory**: Maintains last 10 messages for context-aware conversations
- ⚡ **Smart Filtering**: Ignores old messages, duplicate messages, and self-messages
- 🎯 **Voice Detection**: Automatically detects when users request voice responses

## Prerequisites

- Node.js (v18 or higher)
- Windows OS (for built-in speech synthesizer)
- [WhatsApp-Go Bridge](https://github.com/aldinokemal/go-whatsapp-web-multidevice) running on port 2000
- Google Gemini API key

## Installation

1. Clone the repository:
```bash
git clone https://github.com/mannat-07/WhatsApp-Bot.git
cd whatsapp-ai-brain
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env.local` file in the root directory:
```env
PHONE_NUMBER=your_phone_number_without_country_code
GEMINI_API_KEY=your_gemini_api_key
```

4. Start the WhatsApp-Go bridge on port 2000

5. Run the development server:
```bash
npm run dev
```

The server will start on [http://localhost:3000](http://localhost:3000)

## Usage

### Text Messages
Simply send any message to the bot and it will respond with a detailed AI-generated answer.

### Voice Messages
Include any of these keywords in your message to receive a voice response:
- "voice note"
- "voice message"
- "send voice"
- "send audio"
- "as voice"
- "in voice"
- "speak it"
- "say it"

**Example**: "Explain 3NF in DBMS as a voice message"

## Configuration

### WhatsApp Bridge
- URL: `http://localhost:2000`
- Endpoints used:
  - `/send/message` - Send text messages
  - `/send/file` - Send voice messages

### Audio Settings
- Format: WAV
- Max length: 1500 characters
- Storage: `public/audio/`

### Conversation Settings
- History limit: Last 10 messages
- Processed messages cache: Last 100 message IDs

## How It Works

1. WhatsApp bridge sends webhook to `/api/message` endpoint
2. Bot validates message (checks timestamp, sender, duplicates)
3. Detects if voice response is requested
4. Generates AI response using Gemini API
5. Converts to speech if voice requested (Windows Speech Synthesizer)
6. Sends response back via WhatsApp bridge

## Technical Stack

- **Framework**: Next.js 16.0.3 with Turbopack
- **AI**: Google Gemini 2.0 Flash
- **TTS**: Windows Speech Synthesizer (PowerShell)
- **WhatsApp**: WhatsApp-Go Bridge
- **Network**: IPv4 forced to prevent timeout issues

## Troubleshooting

### Voice messages not working
- Ensure Windows Speech Synthesizer is available
- Check `public/audio/` directory exists
- Verify PowerShell execution policy allows scripts

### Network timeouts
The bot forces IPv4 to avoid IPv6 timeout issues. This is configured automatically.

## License

MIT

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.
