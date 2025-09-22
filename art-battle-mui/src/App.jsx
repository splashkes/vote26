import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { Container, Typography, AppBar, Toolbar, Box } from '@mui/material'
import AnalyticsIcon from '@mui/icons-material/Analytics'
import EventAnalytics from './components/EventAnalytics'
import EventSelector from './components/EventSelector'

function App() {
  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <AnalyticsIcon sx={{ mr: 2 }} />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Art Battle Analytics
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Routes>
          <Route path="/" element={<EventSelector />} />
          <Route path="/:eventId" element={<EventAnalytics />} />
        </Routes>
      </Container>
    </Box>
  )
}

export default App