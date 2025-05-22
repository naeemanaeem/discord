import axios from 'axios';
export async function queryOllama({ prompt, stream = false }) {
    const res = await axios.post(
      'http://localhost:11434/api/generate',
      {
        model: 'llama3',
        prompt,
        stream,
      },
      stream ? { responseType: 'stream' } : {}
    );
    return res;
  }
  