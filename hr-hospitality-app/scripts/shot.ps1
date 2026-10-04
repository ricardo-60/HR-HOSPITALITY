<#
.SYNOPSIS
    Captura de ecrã limpa da janela da app Electron (Cliente ou Servidor) e
    verificacao de "tela preta" por luminancia media.

.DESCRIPTION
    A diretiva de QA pede `shot.ps1` + OCR. Este repositorio nao tinha o
    script, e o tesseract nao esta instalado nesta maquina, por isso a
    verificacao de conteudo e feita de duas formas:

      * o PNG fica gravado para inspeccao visual;
      * a luminancia media e a contagem de cores distintas sao calculadas
        directamente do bitmap - um ecrã preto tem luminancia ~0 e 1 cor,
        o que detecta o defeito sem depender de OCR.

    Captura com PrintWindow(PW_RENDERFULLCONTENT), que vai directo ao
    processo grafico e por isso apanha o conteudo real do Chromium em vez
    de uma janela sobreposta.

.EXAMPLE
    .\shot.ps1
    .\shot.ps1 -Processo 'HR Hospitality Servidor' -Saida .\servidor.png
#>
param(
    [string]$Processo = 'HR Hospitality Cliente',
    [string]$Saida = '',
    [int]$AguardarMs = 800,
    # Amostragem a cada N px: 8 = ~22 mil leituras numa janela 1600x900.
    [int]$Passo = 8
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace WinCap {
    public static class Native {
        [StructLayout(LayoutKind.Sequential)]
        public struct RECT {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        [DllImport("user32.dll")]
        public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);

        [DllImport("user32.dll")]
        public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

        [DllImport("dwmapi.dll")]
        public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out RECT rect, int size);
    }
}
'@

function Obter-Janela {
    $alvo = $Processo -replace '\.exe$', ''
    $proc = Get-Process -Name $alvo -ErrorAction Stop |
        Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ne '' } |
        Select-Object -First 1
    if (-not $proc) {
        throw "Nenhuma janela visivel de '$alvo'. A app esta a correr?"
    }
    return $proc
}

if ($AguardarMs -gt 0) { Start-Sleep -Milliseconds $AguardarMs }

$proc = Obter-Janela
$hwnd = $proc.MainWindowHandle

# DWMWA_EXTENDED_FRAME_BOUNDS (9) da a moldura limpa, sem as sombras.
$rect = New-Object 'WinCap.Native+RECT'
if ([WinCap.Native]::DwmGetWindowAttribute($hwnd, 9, [ref]$rect, 16) -ne 0) {
    [void][WinCap.Native]::GetWindowRect($hwnd, [ref]$rect)
}

$w = $rect.Right - $rect.Left
$h = $rect.Bottom - $rect.Top
if ($w -le 0 -or $h -le 0) {
    throw "Dimensoes invalidas da janela ($w x $h)."
}

if (-not $Saida) {
    $dir = Join-Path $PSScriptRoot 'shots'
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    $carimbo = (Get-Date).ToString('yyyyMMdd_HHmmss')
    $Saida = Join-Path $dir ("{0}_{1}.png" -f ($Processo -replace '[^\w]+', '_'), $carimbo)
}
$saidaDir = Split-Path -Parent $Saida
if ($saidaDir -and -not (Test-Path $saidaDir)) { New-Item -ItemType Directory -Path $saidaDir | Out-Null }

$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
# 2 = PW_RENDERFULLCONTENT
[void][WinCap.Native]::PrintWindow($hwnd, $hdc, 2)
$g.ReleaseHdc($hdc)
$g.Dispose()

# Nao gravar uma captura toda a preta: e precisamente o defeito que se procura.
$soma = 0
$amostras = 0
$cores = New-Object 'System.Collections.Generic.HashSet[int]'
$y = 0
while ($y -lt $h) {
    $x = 0
    while ($x -lt $w) {
        $c = $bmp.GetPixel($x, $y)
        $soma += [int]((0.299 * $c.R) + (0.587 * $c.G) + (0.114 * $c.B))
        $amostras++
        [void]$cores.Add(($c.R -shl 16) -bor ($c.G -shl 8) -bor $c.B)
        $x += $Passo
    }
    $y += $Passo
}
$media = if ($amostras -gt 0) { [math]::Round($soma / $amostras, 1) } else { 0 }

$bmp.Save($Saida, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Output "CAPTURA: $Saida"
Write-Output "  processo:            $($proc.ProcessName) (pid $($proc.Id))"
Write-Output "  titulo:              $($proc.MainWindowTitle)"
Write-Output "  janela:              $w x $h"
Write-Output "  luminancia media:    $media  (0 = preto, 255 = branco)"
Write-Output "  cores distintas:     $($cores.Count)"

$preto = ($media -lt 3) -or ($cores.Count -le 2)
if ($preto) {
    Write-Output "  VEREDITO: FALHA - ecrã preto/vazio (luminancia $media, $($cores.Count) cores)"
    exit 1
}
Write-Output "  VEREDITO: OK - interface visivel e colorida"
exit 0
