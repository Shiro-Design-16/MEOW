import {
  AppsOutlined,
  ArrowForwardRounded,
  PaletteOutlined,
} from '@mui/icons-material'
import {
  Box,
  Button,
  FormControl,
  MenuItem,
  Paper,
  Select,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { BasePage } from '@/components/base'
import { ThemeModeSwitch } from '@/components/setting/mods/theme-mode-switch'
import { useVerge } from '@/hooks/use-verge'
import { showNotice } from '@/services/notice-service'
import {
  canSelectThemeMode,
  getThemePackage,
  useInstalledThemePackages,
} from '@/services/themes'

const ExtensionsPage = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { verge, mutateVerge, patchVerge } = useVerge()
  const themePackages = useInstalledThemePackages()
  const activePackage = getThemePackage(verge?.active_theme)
  const activeTheme = activePackage.theme
  const canSwitchMode = canSelectThemeMode(activeTheme)
  const selectedMode = canSwitchMode
    ? (verge?.theme_mode ?? 'system')
    : activeTheme.supportedModes[0]

  const updateVerge = async (patch: Partial<IVergeConfig>) => {
    mutateVerge({ ...verge, ...patch }, false)
    try {
      await patchVerge(patch)
    } catch (error) {
      showNotice.error(error)
    }
  }

  return (
    <BasePage
      title={t('rules.extensions.title')}
      contentStyle={{ overflow: 'auto' }}
    >
      <Box sx={{ width: '100%', maxWidth: 900, mx: 'auto', py: 3 }}>
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
            <PaletteOutlined color="primary" />
            <Box>
              <Typography variant="h6">
                {t('rules.extensions.theme.title')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('rules.extensions.theme.description')}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
            <Box
              component="img"
              src={activePackage.preview.icon}
              alt={activeTheme.name}
              sx={{ width: 64, height: 64, flex: '0 0 auto' }}
            />
            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 2,
                  mb: 2,
                }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 650 }}>
                    {activeTheme.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    v{activeTheme.version} · {activeTheme.author}
                  </Typography>
                </Box>
                <Button
                  size="small"
                  endIcon={<ArrowForwardRounded />}
                  onClick={() => navigate('/extensions/themes')}
                >
                  {t('rules.extensions.theme.manage')}
                </Button>
              </Box>

              <Box>
                <Typography variant="body2" sx={{ mb: 0.75 }}>
                  {t('rules.extensions.theme.package')}
                </Typography>
                <FormControl size="small" fullWidth>
                  <Select
                    value={activeTheme.id}
                    onChange={(event) =>
                      void updateVerge({ active_theme: event.target.value })
                    }
                  >
                    {themePackages.map(({ theme }) => (
                      <MenuItem key={theme.id} value={theme.id}>
                        {theme.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              <Box>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  {t('rules.extensions.theme.mode')}
                </Typography>
                <ThemeModeSwitch
                  value={selectedMode}
                  disabled={!canSwitchMode}
                  translationPrefix="rules.extensions.theme.modes"
                  onChange={(theme_mode) => void updateVerge({ theme_mode })}
                />
                {!canSwitchMode && (
                  <Typography variant="caption" color="text.secondary">
                    {t('rules.extensions.theme.modeUnavailable')}
                  </Typography>
                )}
              </Box>
            </Box>
          </Box>
        </Paper>

        <Paper
          variant="outlined"
          sx={{ p: 4, mt: 3, textAlign: 'center', borderStyle: 'dashed' }}
        >
          <AppsOutlined color="primary" sx={{ fontSize: 48, mb: 1 }} />
          <Typography variant="h6">
            {t('rules.extensions.empty.title')}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            {t('rules.extensions.empty.description')}
          </Typography>
        </Paper>
      </Box>
    </BasePage>
  )
}

export default ExtensionsPage
