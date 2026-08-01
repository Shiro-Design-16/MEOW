import {
  Box,
  InputAdornment,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  TextField,
  styled,
} from '@mui/material'
import { LogicalSize } from '@tauri-apps/api/dpi'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { forwardRef, useImperativeHandle, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog, DialogRef, Switch, TooltipIcon } from '@/components/base'
import { DEFAULT_HOVER_DELAY } from '@/components/proxy/proxy-group-navigator'
import { useVerge } from '@/hooks/use-verge'
import { useWindowDecorations } from '@/hooks/use-window'
import { showNotice } from '@/services/notice-service'
import getSystem from '@/utils/get-system'

import { GuardState } from './guard-state'

const OS = getSystem()

const clampHoverDelay = (value: number) => {
  if (!Number.isFinite(value)) {
    return DEFAULT_HOVER_DELAY
  }
  return Math.min(5000, Math.max(0, Math.round(value)))
}

export const LayoutViewer = forwardRef<DialogRef>((_, ref) => {
  const { t } = useTranslation()
  const { verge, patchVerge, mutateVerge } = useVerge()

  const [open, setOpen] = useState(false)
  const { setDecorations } = useWindowDecorations()
  const [screenshotResolution, setScreenshotResolution] = useState('')

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
    close: () => setOpen(false),
  }))

  const onSwitchFormat = (_e: any, value: boolean) => value
  const onError = (err: any) => {
    showNotice.error(err)
  }
  const onChangeData = (patch: Partial<IVergeConfig>) => {
    mutateVerge({ ...verge, ...patch }, false)
  }
  const applyScreenshotResolution = async (resolution: string) => {
    const [width, height] = resolution.split('x').map(Number)
    const window = getCurrentWindow()
    await window.setSize(new LogicalSize(width, height))
    await window.center()
    setScreenshotResolution(resolution)
  }

  return (
    <BaseDialog
      open={open}
      title={t('settings.components.verge.layout.title')}
      contentSx={{ width: 450 }}
      disableOk
      cancelBtn={t('shared.actions.close')}
      onClose={() => setOpen(false)}
      onCancel={() => setOpen(false)}
    >
      <List>
        <Item>
          <ListItemText
            primary={t(
              'settings.components.verge.layout.fields.preferSystemTitlebar',
            )}
          />
          <GuardState
            value={verge?.prefer_system_titlebar ?? OS === 'windows'}
            valueProps="checked"
            onCatch={onError}
            onFormat={onSwitchFormat}
            onChange={(value) =>
              onChangeData({ prefer_system_titlebar: value })
            }
            onGuard={async (value) => {
              await setDecorations(value)
              await patchVerge({ prefer_system_titlebar: value })
            }}
          >
            <Switch edge="end" />
          </GuardState>
        </Item>

        <Item>
          <ListItemText
            primary={t(
              'settings.components.verge.layout.fields.screenshotResolution',
            )}
            secondary={t(
              'settings.components.verge.layout.tooltips.screenshotResolution',
            )}
          />
          <Select
            size="small"
            displayEmpty
            value={screenshotResolution}
            sx={{ width: 190, '> div': { py: '7.5px' } }}
            onChange={(event) =>
              void applyScreenshotResolution(event.target.value).catch(onError)
            }
          >
            <MenuItem value="" disabled>
              {t(
                'settings.components.verge.layout.options.screenshotResolution.select',
              )}
            </MenuItem>
            <MenuItem value="1280x720">1280 × 720 (720p)</MenuItem>
            <MenuItem value="1920x1080">1920 × 1080 (1080p)</MenuItem>
          </Select>
        </Item>

        <Item>
          <ListItemText
            primary={t('settings.components.verge.layout.fields.trafficGraph')}
          />
          <GuardState
            value={verge?.traffic_graph ?? true}
            valueProps="checked"
            onCatch={onError}
            onFormat={onSwitchFormat}
            onChange={(e) => onChangeData({ traffic_graph: e })}
            onGuard={(e) => patchVerge({ traffic_graph: e })}
          >
            <Switch edge="end" />
          </GuardState>
        </Item>

        <Item>
          <ListItemText
            primary={t('settings.components.verge.layout.fields.memoryUsage')}
          />
          <GuardState
            value={verge?.enable_memory_usage ?? true}
            valueProps="checked"
            onCatch={onError}
            onFormat={onSwitchFormat}
            onChange={(e) => onChangeData({ enable_memory_usage: e })}
            onGuard={(e) => patchVerge({ enable_memory_usage: e })}
          >
            <Switch edge="end" />
          </GuardState>
        </Item>

        <Item>
          <ListItemText
            primary={t(
              'settings.components.verge.layout.fields.proxyGroupIcon',
            )}
          />
          <GuardState
            value={verge?.enable_group_icon ?? true}
            valueProps="checked"
            onCatch={onError}
            onFormat={onSwitchFormat}
            onChange={(e) => onChangeData({ enable_group_icon: e })}
            onGuard={(e) => patchVerge({ enable_group_icon: e })}
          >
            <Switch edge="end" />
          </GuardState>
        </Item>

        <Item>
          <ListItemText
            primary={t(
              'settings.components.verge.layout.fields.pauseRenderTrafficStatsOnBlur',
            )}
          />
          <GuardState
            value={verge?.pause_render_traffic_stats_on_blur ?? true}
            valueProps="checked"
            onCatch={onError}
            onFormat={onSwitchFormat}
            onChange={(e) =>
              onChangeData({ pause_render_traffic_stats_on_blur: e })
            }
            onGuard={(e) =>
              patchVerge({ pause_render_traffic_stats_on_blur: e })
            }
          >
            <Switch edge="end" />
          </GuardState>
        </Item>

        <Item>
          <ListItemText
            primary={t('settings.components.verge.layout.fields.toastPosition')}
          />
          <GuardState
            value={verge?.notice_position ?? 'top-right'}
            onCatch={onError}
            onFormat={(e: any) => e.target.value}
            onChange={(value) => onChangeData({ notice_position: value })}
            onGuard={(value) => patchVerge({ notice_position: value })}
          >
            <Select size="small" sx={{ width: 180, '> div': { py: '7.5px' } }}>
              <MenuItem value="top-right">
                {t(
                  'settings.components.verge.layout.options.toastPosition.topRight',
                )}
              </MenuItem>
              <MenuItem value="top-left">
                {t(
                  'settings.components.verge.layout.options.toastPosition.topLeft',
                )}
              </MenuItem>
              <MenuItem value="bottom-right">
                {t(
                  'settings.components.verge.layout.options.toastPosition.bottomRight',
                )}
              </MenuItem>
              <MenuItem value="bottom-left">
                {t(
                  'settings.components.verge.layout.options.toastPosition.bottomLeft',
                )}
              </MenuItem>
            </Select>
          </GuardState>
        </Item>

        <Item>
          <ListItemText
            primary={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <span>
                  {t('settings.components.verge.layout.fields.hoverNavigator')}
                </span>
                <TooltipIcon
                  title={t(
                    'settings.components.verge.layout.tooltips.hoverNavigator',
                  )}
                  sx={{ opacity: '0.7' }}
                />
              </Box>
            }
          />
          <GuardState
            value={verge?.enable_hover_jump_navigator ?? true}
            valueProps="checked"
            onCatch={onError}
            onFormat={onSwitchFormat}
            onChange={(e) => onChangeData({ enable_hover_jump_navigator: e })}
            onGuard={(e) => patchVerge({ enable_hover_jump_navigator: e })}
          >
            <Switch edge="end" />
          </GuardState>
        </Item>

        <Item>
          <ListItemText
            primary={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <span>
                  {t(
                    'settings.components.verge.layout.fields.hoverNavigatorDelay',
                  )}
                </span>
                <TooltipIcon
                  title={t(
                    'settings.components.verge.layout.tooltips.hoverNavigatorDelay',
                  )}
                  sx={{ opacity: '0.7' }}
                />
              </Box>
            }
          />
          <GuardState
            value={verge?.hover_jump_navigator_delay ?? DEFAULT_HOVER_DELAY}
            waitTime={400}
            onCatch={onError}
            onFormat={(e: any) => clampHoverDelay(Number(e.target.value))}
            onChange={(value) =>
              onChangeData({
                hover_jump_navigator_delay: clampHoverDelay(value),
              })
            }
            onGuard={(value) =>
              patchVerge({ hover_jump_navigator_delay: clampHoverDelay(value) })
            }
          >
            <TextField
              type="number"
              size="small"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              sx={{ width: 120 }}
              disabled={!(verge?.enable_hover_jump_navigator ?? true)}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      {t('shared.units.milliseconds')}
                    </InputAdornment>
                  ),
                },
                htmlInput: {
                  min: 0,
                  max: 5000,
                  step: 20,
                },
              }}
            />
          </GuardState>
        </Item>

        <Item>
          <ListItemText
            primary={t(
              'settings.components.verge.layout.fields.collapseNavBar',
            )}
          />
          <GuardState
            value={verge?.collapse_navbar ?? false}
            valueProps="checked"
            onCatch={onError}
            onFormat={onSwitchFormat}
            onChange={(e) => onChangeData({ collapse_navbar: e })}
            onGuard={(e) => patchVerge({ collapse_navbar: e })}
          >
            <Switch edge="end" />
          </GuardState>
        </Item>

        {OS === 'macos' && (
          <Item>
            <ListItemText
              primary={t(
                'settings.components.verge.layout.fields.enableTraySpeed',
              )}
            />
            <GuardState
              value={verge?.enable_tray_speed ?? false}
              valueProps="checked"
              onCatch={onError}
              onFormat={onSwitchFormat}
              onChange={(e) => onChangeData({ enable_tray_speed: e })}
              onGuard={(e) => patchVerge({ enable_tray_speed: e })}
            >
              <Switch edge="end" />
            </GuardState>
          </Item>
        )}
        <Item>
          <ListItemText
            primary={t(
              'settings.components.verge.layout.fields.proxyGroupsDisplayMode',
            )}
          />
          <GuardState
            value={verge?.tray_proxy_groups_display_mode ?? 'default'}
            onCatch={onError}
            onFormat={(e: any) => e.target.value}
            onChange={(value) =>
              onChangeData({ tray_proxy_groups_display_mode: value })
            }
            onGuard={(value) =>
              patchVerge({ tray_proxy_groups_display_mode: value })
            }
          >
            <Select size="small" sx={{ width: 140, '> div': { py: '7.5px' } }}>
              <MenuItem value="default">
                {t(
                  'settings.components.verge.layout.options.proxyGroupsDisplayMode.default',
                )}
              </MenuItem>
              <MenuItem value="inline">
                {t(
                  'settings.components.verge.layout.options.proxyGroupsDisplayMode.inline',
                )}
              </MenuItem>
              <MenuItem value="disable">
                {t(
                  'settings.components.verge.layout.options.proxyGroupsDisplayMode.disable',
                )}
              </MenuItem>
            </Select>
          </GuardState>
        </Item>
        <Item>
          <ListItemText
            primary={t(
              'settings.components.verge.layout.fields.showOutboundModesInline',
            )}
          />
          <GuardState
            value={verge?.tray_inline_outbound_modes ?? false}
            valueProps="checked"
            onCatch={onError}
            onFormat={onSwitchFormat}
            onChange={(e) => onChangeData({ tray_inline_outbound_modes: e })}
            onGuard={(e) => patchVerge({ tray_inline_outbound_modes: e })}
          >
            <Switch edge="end" />
          </GuardState>
        </Item>
      </List>
    </BaseDialog>
  )
})

const Item = styled(ListItem)(() => ({
  padding: '5px 2px',
}))
