import {
  ArrowBackRounded,
  CheckCircleRounded,
  CloudDownloadOutlined,
  DeleteOutlineRounded,
  UploadFileRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Chip,
  Grid,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { BasePage } from '@/components/base'
import { ThemeModeSwitch } from '@/components/setting/mods/theme-mode-switch'
import { useVerge } from '@/hooks/use-verge'
import { showNotice } from '@/services/notice-service'
import { useThemeMode } from '@/services/states'
import {
  canSelectThemeMode,
  getThemeDefinition,
  importThemePackage,
  removeThemePackage,
  useInstalledThemePackages,
} from '@/services/themes'

const ThemeManagerPage = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { verge, mutateVerge, patchVerge } = useVerge()
  const themePackages = useInstalledThemePackages()
  const renderedMode = useThemeMode()
  const activeTheme = getThemeDefinition(verge?.active_theme)
  const canSwitchMode = canSelectThemeMode(activeTheme)
  const selectedMode = canSwitchMode
    ? (verge?.theme_mode ?? 'system')
    : activeTheme.supportedModes[0]
  const [importing, setImporting] = useState(false)

  const updateVerge = async (patch: Partial<IVergeConfig>) => {
    mutateVerge({ ...verge, ...patch }, false)
    try {
      await patchVerge(patch)
    } catch (error) {
      showNotice.error(error)
    }
  }

  const applyTheme = (active_theme: string) => updateVerge({ active_theme })

  const importTheme = async () => {
    const sourceDirectory = await openDialog({
      directory: true,
      multiple: false,
      title: t('rules.extensions.theme.manager.importDialogTitle'),
    })
    if (typeof sourceDirectory !== 'string') return

    setImporting(true)
    try {
      const theme = await importThemePackage(sourceDirectory)
      await applyTheme(theme.id)
      showNotice.success('rules.extensions.theme.manager.imported')
    } catch (error) {
      showNotice.error(error)
    } finally {
      setImporting(false)
    }
  }

  const removeTheme = async (id: string, name: string) => {
    if (
      !window.confirm(
        t('rules.extensions.theme.manager.confirmRemove', { name }),
      )
    ) {
      return
    }
    if (verge?.active_theme === id) {
      await applyTheme('meow.default')
    }
    removeThemePackage(id)
    showNotice.success('rules.extensions.theme.manager.removed')
  }

  return (
    <BasePage
      title={t('rules.extensions.theme.manager.title')}
      contentStyle={{ overflow: 'auto' }}
      header={
        <Stack direction="row" spacing={1}>
          <Button
            variant="text"
            startIcon={<ArrowBackRounded />}
            onClick={() => navigate('/extensions')}
          >
            {t('rules.page.actions.back')}
          </Button>
          <Button
            variant="contained"
            loading={importing}
            startIcon={<UploadFileRounded />}
            onClick={() => void importTheme()}
          >
            {t('rules.extensions.theme.manager.import')}
          </Button>
        </Stack>
      }
    >
      <Box sx={{ width: '100%', maxWidth: 1120, mx: 'auto', pb: 3 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('rules.extensions.theme.manager.description')}
        </Typography>

        <Paper
          variant="outlined"
          sx={{
            p: 1.5,
            mb: 2,
            display: 'flex',
            gap: 2,
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
          }}
        >
          <Box>
            <Typography sx={{ fontWeight: 650 }}>
              {t('rules.extensions.theme.mode')}
            </Typography>
            {!canSwitchMode && (
              <Typography variant="caption" color="text.secondary">
                {t('rules.extensions.theme.modeUnavailable')}
              </Typography>
            )}
          </Box>
          <ThemeModeSwitch
            value={selectedMode}
            disabled={!canSwitchMode}
            translationPrefix="rules.extensions.theme.modes"
            onChange={(theme_mode) => void updateVerge({ theme_mode })}
          />
        </Paper>

        <Grid container spacing={2}>
          {themePackages.map(({ theme, source, preview }) => {
            const active = verge?.active_theme === theme.id
            const previewImage =
              preview.default ??
              (renderedMode === 'dark' ? preview.dark : preview.light) ??
              preview.light ??
              preview.dark

            return (
              <Grid key={theme.id} size={{ xs: 12, sm: 6 }}>
                <Paper
                  variant="outlined"
                  sx={{ overflow: 'hidden', height: '100%' }}
                >
                  <Box
                    component="img"
                    src={previewImage}
                    alt={t(
                      renderedMode === 'dark'
                        ? 'rules.extensions.theme.manager.previewDark'
                        : 'rules.extensions.theme.manager.previewLight',
                    )}
                    sx={{
                      display: 'block',
                      width: '100%',
                      bgcolor: 'action.hover',
                      aspectRatio: '16 / 9',
                      objectFit: 'cover',
                    }}
                  />

                  <Box sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', gap: 1.5 }}>
                      <Box
                        component="img"
                        src={preview.icon}
                        alt={theme.name}
                        sx={{ width: 52, height: 52, flex: '0 0 auto' }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Stack
                          direction="row"
                          spacing={1}
                          sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                        >
                          <Typography variant="h6" noWrap>
                            {theme.name}
                          </Typography>
                          {active && (
                            <Chip
                              size="small"
                              color="primary"
                              icon={<CheckCircleRounded />}
                              label={t('rules.extensions.theme.manager.active')}
                            />
                          )}
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          v{theme.version} · {theme.author}
                        </Typography>
                      </Box>
                    </Box>

                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        mt: 2,
                      }}
                    >
                      <Chip
                        size="small"
                        variant="outlined"
                        label={t(
                          source === 'built-in'
                            ? 'rules.extensions.theme.manager.builtIn'
                            : 'rules.extensions.theme.manager.local',
                        )}
                      />
                      <Stack direction="row" spacing={0.5}>
                        {source === 'local' && (
                          <IconButton
                            size="small"
                            color="error"
                            title={t('rules.extensions.theme.manager.remove')}
                            onClick={() =>
                              void removeTheme(theme.id, theme.name)
                            }
                          >
                            <DeleteOutlineRounded />
                          </IconButton>
                        )}
                        <Button
                          size="small"
                          variant={active ? 'outlined' : 'contained'}
                          disabled={active}
                          onClick={() => void applyTheme(theme.id)}
                        >
                          {t(
                            active
                              ? 'rules.extensions.theme.manager.applied'
                              : 'rules.extensions.theme.manager.apply',
                          )}
                        </Button>
                      </Stack>
                    </Box>
                  </Box>
                </Paper>
              </Grid>
            )
          })}
        </Grid>

        <Paper
          variant="outlined"
          sx={{ mt: 3, p: 4, textAlign: 'center', borderStyle: 'dashed' }}
        >
          <CloudDownloadOutlined color="primary" sx={{ fontSize: 44 }} />
          <Typography variant="h6" sx={{ mt: 1 }}>
            {t('rules.extensions.theme.manager.onlineTitle')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t('rules.extensions.theme.manager.onlineDescription')}
          </Typography>
        </Paper>
      </Box>
    </BasePage>
  )
}

export default ThemeManagerPage
