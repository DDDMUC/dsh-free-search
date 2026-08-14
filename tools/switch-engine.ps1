# dsh-free-search 引擎切换工具
# 用法：右键"以 PowerShell 运行"，或双击运行（先检查执行策略）

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("ddg", "ddg-lite", "bing", "mojeek", "exa", "perplexity", "deepseek-official")]
    [string]$Engine
)

$patchFile = "$env:USERPROFILE\.dsh\profiles\web\cordis.patch.yml"
if (-not (Test-Path $patchFile)) {
    Write-Host "ERROR: 找不到配置文件 $patchFile" -ForegroundColor Red
    exit 1
}

# 读取文件（UTF-8）
$content = Get-Content $patchFile -Raw -Encoding UTF8

# 替换 searchProvider 行（支持 - id: web / config: / searchProvider: xxx 结构）
if ($content -match '(?m)^(\s*- id: web\r?\n\s*config:\r?\n\s*searchProvider: )[^\r\n]*') {
    $content = $content -replace '(?m)^(\s*- id: web\r?\n\s*config:\r?\n\s*searchProvider: )[^\r\n]*', "`${1}$Engine"
    Write-Host "已切换搜索引擎: $Engine" -ForegroundColor Green
} else {
    # 没有找到 web 条目，追加
    $append = @"

# ============================================================
# 搜索引擎 provider（由 dsh-free-search 切换工具写入）
# ============================================================
- id: web
  config:
    searchProvider: $Engine
"@
    $content += $append
    Write-Host "已追加搜索引擎配置: $Engine" -ForegroundColor Green
}

# 写回（UTF-8 无 BOM）
[System.IO.File]::WriteAllText($patchFile, $content, (New-Object System.Text.UTF8Encoding $false))

Write-Host ""
Write-Host "配置已更新！请重启 dsh web 生效：" -ForegroundColor Yellow
Write-Host "  1. 关闭当前 dsh web 窗口"
Write-Host "  2. 重新运行: dsh web"
Write-Host ""
