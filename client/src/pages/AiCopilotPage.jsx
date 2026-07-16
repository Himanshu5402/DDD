import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Box, Paper, TextField, Button, Typography, CircularProgress, Chip, Alert } from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PageHeader from '../components/ui/PageHeader.jsx';
import api, { getErrorMessage } from '../lib/axios.js';

export default function AiCopilotPage() {
  const [prompt, setPrompt] = useState('');

  const ask = useMutation({
    mutationFn: async (text) => {
      const res = await api.post('/ai/ask', { prompt: text });
      return res.data.data;
    },
  });

  const onSubmit = (e) => {
    e.preventDefault();
    if (prompt.trim()) ask.mutate(prompt.trim());
  };

  return (
    <Box>
      <PageHeader
        title="AI Copilot"
        subtitle="Vendor-neutral business assistant (Claude / OpenAI, MCP-ready)."
        action={ask.data && <Chip icon={<SmartToyIcon />} label={`provider: ${ask.data.provider}`} />}
      />

      <Paper elevation={0} component="form" onSubmit={onSubmit} sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
        <TextField
          fullWidth
          multiline
          minRows={3}
          placeholder="Ask anything… e.g. 'Summarize what my team should focus on today.'"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="submit" variant="contained" disabled={ask.isPending || !prompt.trim()}>
            {ask.isPending ? <CircularProgress size={20} color="inherit" /> : 'Ask copilot'}
          </Button>
        </Box>
      </Paper>

      {ask.isError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {getErrorMessage(ask.error, 'AI request failed')}
        </Alert>
      )}

      {ask.data && (
        <Paper elevation={0} sx={{ p: 3, mt: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'grey.50' }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Response
          </Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{ask.data.text}</Typography>
        </Paper>
      )}
    </Box>
  );
}
