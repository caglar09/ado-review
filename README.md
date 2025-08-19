# ADO Review CLI 🤖

**Azure DevOps PR Review CLI** - AI destekli otomatik kod inceleme aracı

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Azure DevOps](https://img.shields.io/badge/Azure_DevOps-0078D4?style=flat&logo=azure-devops&logoColor=white)](https://azure.microsoft.com/en-us/services/devops/)
[![Gemini](https://img.shields.io/badge/Google_Gemini-8E75B2?style=flat&logo=google&logoColor=white)](https://ai.google.dev/)

## 📋 İçindekiler

- [Genel Bakış](#-genel-bakış)
- [Özellikler](#-özellikler)
- [Kurulum](#-kurulum)
- [Kullanım](#-kullanım)
- [Konfigürasyon](#-konfigürasyon)
- [Kurallar ve Bağlam](#-kurallar-ve-bağlam)
- [CLI Parametreleri](#-cli-parametreleri)
- [Örnekler](#-örnekler)
- [Geliştirme](#-geliştirme)
- [Katkıda Bulunma](#-katkıda-bulunma)
- [Lisans](#-lisans)

## 🎯 Genel Bakış

**ADO Review CLI**, Azure DevOps Pull Request'lerini Google Gemini AI kullanarak otomatik olarak inceleyen profesyonel bir komut satırı aracıdır. Önceden tanımlanmış kurallar, proje standartları ve kod bağlamını birleştirerek kapsamlı ve akıllı kod incelemeleri gerçekleştirir.

### 🚀 Ana Hedefler

- **Tek Komutla İnceleme**: PR URL veya ID ile hızlı başlatma
- **Akıllı Bağlam**: Kurallar + proje rehberleri + diff analizi
- **Odaklı İnceleme**: Sadece değişen dosyalar ve satırlar
- **Performans Odaklı**: Rate limiting ve batch işleme
- **Profesyonel UX**: Detaylı loglama, hata yönetimi, temizlik

## ✨ Özellikler

### 🔍 İnceleme Özellikleri
- **AI Destekli Analiz**: Google Gemini modelleri ile kod inceleme
- **Çoklu Giriş Formatı**: PR URL veya ID + organizasyon bilgileri
- **Akıllı Dosya Filtreleme**: Include/exclude pattern'ları
- **Severity Tabanlı Filtreleme**: Info, warn, error seviyeleri
- **Batch İşleme**: Büyük PR'lar için optimize edilmiş strateji
- **PR Onaylama**: İnceleme sonrası doğrudan PR onaylama seçeneği

### 🛠️ Teknik Özellikler
- **Sparse Git Clone**: Sadece gerekli dosyaları indirme
- **Rate Limit Yönetimi**: API limitlerini aşmayan akıllı çağrılar
- **Idempotent Yorumlar**: Duplicate yorum önleme
- **Temporary Workspace**: Güvenli ve temiz çalışma ortamı
- **Comprehensive Logging**: Detaylı adım adım takip

### 🔒 Güvenlik ve Kalite
- **Secret Masking**: Log'larda gizli bilgi koruması
- **Error Handling**: Kapsamlı hata yönetimi ve recovery
- **Exit Codes**: Anlamlı çıkış kodları
- **Validation**: Girdi doğrulama ve schema kontrolü

## 📦 Kurulum

### Gereksinimler

- **Node.js** >= 18.0.0
- **Git** >= 2.25.0
- **Azure DevOps** erişim token'ı
- **Google Gemini API** anahtarı

### NPM ile Kurulum

```bash
# Global kurulum
npm install -g ado-review-cli

# Veya yerel kurulum
npm install ado-review-cli
```

### Kaynak Koddan Kurulum

```bash
# Repository'yi klonla
git clone https://github.com/your-org/ado-review-cli.git
cd ado-review-cli

# Bağımlılıkları yükle
npm install

# Build et
npm run build

# Global link oluştur
npm link
```

### Ortam Değişkenleri

```bash
# Azure DevOps Personal Access Token
export AZURE_DEVOPS_PAT="your-ado-token"

# Google Gemini API Key
export GEMINI_API_KEY="your-gemini-api-key"

# Opsiyonel: Azure DevOps organizasyon URL'i
export AZURE_DEVOPS_ORG_URL="https://dev.azure.com/your-org"
```

## 🚀 Kullanım

### Temel Kullanım

```bash
# PR URL ile inceleme
ado-review review --pr-url "https://dev.azure.com/org/project/_git/repo/pullrequest/123"

# PR ID ile inceleme
ado-review review --pr 123 --org myorg --project myproject --repo myrepo
```

### Kurallar ile İnceleme

```bash
# Tekil kural dosyası
ado-review review --pr-url "..." --rules "./rules/typescript.yaml"

# Çoklu kural dosyaları
ado-review review --pr-url "..." --rules "./rules/*.yaml" --rules "./docs/guidelines.md"

# Proje kuralları ile
ado-review review --pr-url "..." --project-rules "./project-rules.yaml"
```

### Dosya Filtreleme

```bash
# Sadece TypeScript dosyaları
ado-review review --pr-url "..." --include "**/*.ts" --include "**/*.tsx"

# Test dosyalarını hariç tut
ado-review review --pr-url "..." --exclude "**/*.test.*" --exclude "**/*.spec.*"

# Belirli dosyaları incele
ado-review review --pr-url "..." --files "src/app.ts,src/utils.ts"
```

### Gelişmiş Seçenekler

```bash
# Farklı model kullan
ado-review review --pr-url "..." --model "gemini-1.5-flash"

# Otomatik onay (tüm bulguları otomatik gönder)
ado-review review --pr-url "..." --auto-approve

# Dry run (sadece bulguları göster, yorum gönderme)
ado-review review --pr-url "..." --dry-run

# JSON çıktı
ado-review review --pr-url "..." --format json

# Sadece error seviyesi
ado-review review --pr-url "..." --severity-threshold error
```

### 🎯 İnteraktif Onay Sistemi

Varsayılan olarak, ADO Review CLI bulguları gösterdikten sonra kullanıcıdan onay ister:

```bash
# Normal kullanım - interactive approval
ado-review review --pr-url "https://dev.azure.com/org/project/_git/repo/pullrequest/123"
```

**Onay Seçenekleri:**
- **[a] Approve all**: Tüm bulguları Azure DevOps'a gönder
- **[s] Select specific**: Bulguları tek tek seçerek gönder
- **[p] Approve PR**: PR'ı onayla (hiçbir yorum gönderilmez)
- **[n] Cancel**: Hiçbir yorum gönderme

**Selective Approval Örneği:**
```
📝 Review Summary:
Total findings: 5
  • Errors: 2
  • Warnings: 2
  • Info: 1

Options:
  [a] Approve all findings and post to Azure DevOps
  [s] Select specific findings to post
  [n] Cancel - do not post any comments

What would you like to do? [a/s/n]: s

Select findings to post (y/n for each):

1. ERROR - src/app.ts:45
   Variable 'user' is used before being defined
   Post this finding? [y/n]: y
   ✅ Approved

2. WARNING - src/utils.ts:12
   Function 'processData' has too many parameters
   Suggestion: Consider using an options object
   Post this finding? [y/n]: n
   ⏭️  Skipped

✅ Selected 1 out of 5 findings for posting
```

**Otomatik Modlar:**
```bash
# Tüm bulguları otomatik onayla
ado-review review --pr-url "..." --auto-approve

# Sadece göster, hiçbirini gönderme
ado-review review --pr-url "..." --dry-run
```

## ⚙️ Konfigürasyon

### Konfigürasyon Dosyası

Proje kök dizininde `.adorevrc.yaml` dosyası oluşturarak varsayılan ayarları özelleştirebilirsiniz. Bu dosya otomatik olarak algılanır ve varsayılan konfigürasyonla birleştirilir.

#### Temel Kullanım

```bash
# Örnek konfigürasyon dosyasını kopyala
cp .adorevrc.example.yaml .adorevrc.yaml

# Kendi ihtiyaçlarınıza göre düzenleyin
vim .adorevrc.yaml
```

#### Konfigürasyon Örneği

```yaml
# .adorevrc.yaml - Proje özel ayarları
gemini:
  defaultModel: "gemini-1.5-pro-002"
  temperature: 0.1
  topP: 0.95
  timeout: 60000

review:
  severityThreshold: "info"  # info, warning, error
  format: "table"            # table, json, markdown
  maxTableFindings: 20
  contextLines: 3

files:
  defaultInclude:
    - "**/*.ts"
    - "**/*.tsx"
    - "**/*.js"
    - "**/*.jsx"
    - "**/*.py"
  defaultExclude:
    - "node_modules/**"
    - "dist/**"
    - "build/**"
    - "**/*.test.*"
    - "**/*.spec.*"
  maxFileSize: 1048576      # 1MB
  maxTotalFiles: 100

rateLimit:
  batchSize: 3              # Batch başına dosya sayısı
  sleepMs: 2000            # Batch'ler arası bekleme (ms)
  maxConcurrent: 2         # Eşzamanlı istek sayısı
  backoffMultiplier: 2.0   # Hata durumunda çarpan
  maxBackoffMs: 30000      # Maksimum bekleme süresi

logging:
  level: "info"            # error, warn, info, debug
  file:
    enabled: true
    path: "./logs/ado-review.log"
    maxSize: 10485760      # 10MB
    maxFiles: 5
  console:
    enabled: true
    colors: true
    timestamps: true
  maskSecrets:             # Log'larda gizlenecek değişkenler
    - "AZURE_DEVOPS_TOKEN"
    - "GEMINI_API_KEY"

comments:
  maxCommentsPerPR: 50
  maxCommentLength: 2000
  idempotent: true         # Duplicate yorum önleme
  template: "🤖 **AI Code Review**\n\n{findings}\n\n---\n*Generated by ado-review*"

# Azure DevOps ayarları
azo:
  timeout: 30000
  maxRetries: 3
  retryDelay: 1000
  apiVersion: "7.1-preview.1"

# Git ayarları
git:
  depth: 100               # Clone derinliği
  timeout: 30000
  excludePatterns:
    - "*.lock"
    - "package-lock.json"
    - "yarn.lock"
```

#### Konfigürasyon Önceliği

1. **CLI Parametreleri** (en yüksek öncelik)
2. **Ortam Değişkenleri**
3. **`.adorevrc.yaml` Dosyası**
4. **Varsayılan Ayarlar** (en düşük öncelik)

> **💡 İpucu**: Konfigürasyon dosyası isteğe bağlıdır. Belirtilmezse varsayılan ayarlar kullanılır.

### Ortam Değişkenleri

| Değişken | Açıklama | Varsayılan |
|----------|----------|------------|
| `AZURE_DEVOPS_PAT` | Azure DevOps Personal Access Token | - |
| `GEMINI_API_KEY` | Google Gemini API anahtarı | - |
| `AZURE_DEVOPS_ORG_URL` | Azure DevOps organizasyon URL'i | - |
| `ADO_REVIEW_LOG_LEVEL` | Log seviyesi (error/warn/info/debug) | `info` |
| `ADO_REVIEW_TMP_DIR` | Geçici dizin yolu | OS temp |

## 📋 Kurallar ve Bağlam

### Kural Dosyası Formatları

#### YAML Kuralları

```yaml
# rules/typescript.yaml
rules:
  - id: "no-any"
    pattern: ": any"
    severity: "warn"
    message: "Avoid using 'any' type, use specific types instead"
    suggestion: "Consider using union types or generics"
    
  - id: "console-log"
    pattern: "console\.log\("
    severity: "error"
    message: "Remove console.log statements before production"
    suggestion: "Use proper logging library instead"
    
  - id: "todo-comment"
    pattern: "(TODO|FIXME|HACK)"
    severity: "info"
    message: "TODO comment found"
    suggestion: "Consider creating a ticket for this task"
```

#### JSON Kuralları

```json
{
  "rules": [
    {
      "id": "security-check",
      "pattern": "(password|secret|token)\\s*=\\s*['\"][^'\"]+['\"]?",
      "severity": "error",
      "message": "Potential hardcoded secret detected",
      "suggestion": "Use environment variables or secure vault"
    }
  ]
}
```

#### Markdown Rehberleri

```markdown
<!-- docs/coding-standards.md -->
# Coding Standards

## TypeScript Guidelines

- Always use explicit return types for functions
- Prefer `const` over `let` when possible
- Use meaningful variable names
- Add JSDoc comments for public APIs

## Error Handling

- Always handle async operations with try-catch
- Use custom error types for different error categories
- Log errors with appropriate context

## Testing

- Write unit tests for all business logic
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)
```

### Proje Kuralları

```yaml
# project-rules.yaml
project:
  name: "My Awesome Project"
  description: "Enterprise web application"
  
standards:
  - "Follow SOLID principles"
  - "Use dependency injection"
  - "Implement proper error boundaries"
  - "Write comprehensive tests"
  
architecture:
  patterns:
    - "Clean Architecture"
    - "Repository Pattern"
    - "Factory Pattern"
  
  layers:
    - "Presentation (Controllers)"
    - "Business Logic (Services)"
    - "Data Access (Repositories)"
    - "Infrastructure (External APIs)"

performance:
  - "Optimize database queries"
  - "Use caching where appropriate"
  - "Implement lazy loading"
  - "Monitor memory usage"
```

## 🔧 CLI Parametreleri

### Ana Komutlar

```bash
ado-review <command> [options]

Komutlar:
  review     PR incelemesi başlat
  config     Konfigürasyon yönetimi
  version    Versiyon bilgisi göster
```

### Review Komutu Parametreleri

#### PR Tanımlama
```bash
--pr-url <url>                    # PR URL'i
--pr <id>                         # PR ID'si
--org <organization>              # Azure DevOps organizasyonu
--project <project>               # Proje adı
--repo <repository>               # Repository adı
```

#### Kurallar ve Bağlam
```bash
--rules <path|glob>               # Kural dosyaları (çoklu kullanım)
--project-rules <path>            # Proje kuralları dosyası
```

#### Dosya Filtreleme
```bash
--include <glob>                  # Dahil edilecek dosya pattern'ları
--exclude <glob>                  # Hariç tutulacak dosya pattern'ları
--files <list>                    # Belirli dosya listesi (virgülle ayrılmış)
--all-files                       # Tüm dosyaları dahil et
```

#### AI Model Ayarları
```bash
--model <name>                    # Gemini model adı (varsayılan: gemini-1.5-pro)
--max-context-tokens <number>     # Maksimum context token sayısı
```

#### Rate Limiting
```bash
--ratelimit-batch <number>        # Batch boyutu (varsayılan: 5)
--ratelimit-sleep-ms <ms>         # Batch'ler arası bekleme süresi
```

#### Workspace Yönetimi
```bash
--tmp-dir <path>                  # Geçici dizin yolu
--keep-workdir                    # Çalışma dizinini silme
```

**Workspace Yapısı:**
CLI, organize bir workspace yapısı kullanır:
- `source/`: Klonlanan repository dosyaları
- `temp/`: Geçici işlem dosyaları  
- `output/`: Üretilen çıktı dosyaları
- `logs/`: Log dosyaları

Bu yapı, proje dosyaları ile klonlanan repository içeriğinin karışmasını önler.

#### İnceleme Davranışı
```bash
--post-status                     # PR status güncelle
--auto-approve                    # Otomatik onay (interaktif onay atla)
--dry-run                         # Sadece göster, yorum gönderme
```

#### Çıktı Formatı
```bash
--format <table|json>             # Çıktı formatı (varsayılan: table)
--severity-threshold <level>      # Minimum severity seviyesi (info|warn|error)
--verbose                         # Detaylı çıktı
```

## 📚 Örnekler

### Basit İnceleme

```bash
# En basit kullanım
ado-review review --pr-url "https://dev.azure.com/myorg/myproject/_git/myrepo/pullrequest/123"
```

### Kapsamlı İnceleme

```bash
# Tüm özelliklerle
ado-review review \
  --pr-url "https://dev.azure.com/myorg/myproject/_git/myrepo/pullrequest/123" \
  --rules "./rules/*.yaml" \
  --rules "./docs/guidelines.md" \
  --project-rules "./project-rules.yaml" \
  --include "**/*.ts" \
  --include "**/*.tsx" \
  --exclude "**/*.test.*" \
  --model "gemini-1.5-pro" \
  --severity-threshold "warn" \
  --format "table" \
  --post-status \
  --verbose
```

### CI/CD Pipeline Entegrasyonu

```yaml
# Azure DevOps Pipeline
steps:
- task: NodeTool@0
  inputs:
    versionSpec: '18.x'
    
- script: |
    npm install -g ado-review-cli
  displayName: 'Install ADO Review CLI'
  
- script: |
    ado-review review \
      --pr $(System.PullRequest.PullRequestId) \
      --org $(System.TeamFoundationCollectionUri | split('/')[3]) \
      --project $(System.TeamProject) \
      --repo $(Build.Repository.Name) \
      --rules "./rules/*.yaml" \
      --auto-approve \
      --post-status
  displayName: 'AI Code Review'
  env:
    AZURE_DEVOPS_PAT: $(AZURE_DEVOPS_PAT)
    GEMINI_API_KEY: $(GEMINI_API_KEY)
  condition: eq(variables['Build.Reason'], 'PullRequest')
```

### GitHub Actions Entegrasyonu

```yaml
# .github/workflows/ai-review.yml
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  ai-review:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - uses: actions/setup-node@v3
      with:
        node-version: '18'
        
    - name: Install ADO Review CLI
      run: npm install -g ado-review-cli
      
    - name: Run AI Review
      run: |
        ado-review review \
          --pr-url "${{ github.event.pull_request.html_url }}" \
          --rules "./rules/*.yaml" \
          --auto-approve \
          --format json > review-results.json
      env:
        AZURE_DEVOPS_PAT: ${{ secrets.AZURE_DEVOPS_PAT }}
        GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
        
    - name: Upload Results
      uses: actions/upload-artifact@v3
      with:
        name: ai-review-results
        path: review-results.json
```

## 🛠️ Geliştirme

### Geliştirme Ortamı Kurulumu

```bash
# Repository'yi klonla
git clone https://github.com/your-org/ado-review-cli.git
cd ado-review-cli

# Bağımlılıkları yükle
npm install

# Geliştirme modunda çalıştır
npm run dev

# Test'leri çalıştır
npm test

# Linting
npm run lint

# Type checking
npm run type-check
```

### Proje Yapısı

```
ado-review-cli/
├── src/
│   ├── cli/                 # CLI entry point ve argument parsing
│   │   ├── index.ts
│   │   └── argsParser.ts
│   ├── core/                # Ana business logic
│   │   ├── adoClient.ts     # Azure DevOps API client
│   │   ├── gitManager.ts    # Git operations
│   │   ├── diffFetcher.ts   # PR diff fetching
│   │   ├── rulesLoader.ts   # Rules loading ve parsing
│   │   ├── contextBuilder.ts # LLM context building
│   │   ├── reviewPlanner.ts # Review strategy planning
│   │   ├── geminiAdapter.ts # Gemini API adapter
│   │   ├── resultMapper.ts  # Result mapping
│   │   ├── commenter.ts     # Comment posting
│   │   ├── statusReporter.ts # PR status reporting
│   │   ├── logger.ts        # Logging utility
│   │   ├── errorHandler.ts  # Error handling
│   │   ├── workspace.ts     # Workspace management
│   │   └── reviewOrchestrator.ts # Main orchestrator
│   └── config/              # Configuration files
│       ├── defaults.yaml
│       └── schema.json
├── tests/                   # Test files
├── docs/                    # Documentation
├── examples/                # Example configurations
├── package.json
├── tsconfig.json
└── README.md
```

### Test Yazma

```typescript
// tests/core/argsParser.test.ts
import { ArgsParser } from '../../src/cli/argsParser';
import { Logger } from '../../src/core/logger';

describe('ArgsParser', () => {
  let parser: ArgsParser;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('test');
    parser = new ArgsParser(logger);
  });

  describe('parseOptions', () => {
    it('should parse PR URL correctly', async () => {
      const options = {
        prUrl: 'https://dev.azure.com/org/project/_git/repo/pullrequest/123'
      };

      const result = await parser.parseOptions(options);

      expect(result.prUrl).toBe(options.prUrl);
    });

    it('should validate required fields', async () => {
      const options = {};

      await expect(parser.parseOptions(options))
        .rejects
        .toThrow('Either --pr-url or --pr with --org, --project, --repo is required');
    });
  });
});
```

### Debugging

```bash
# Debug modunda çalıştır
DEBUG=ado-review:* npm run dev -- review --pr-url "..."

# Verbose logging
ADO_REVIEW_LOG_LEVEL=debug ado-review review --pr-url "..." --verbose

# Workspace'i sakla (debugging için)
ado-review review --pr-url "..." --keep-workdir --tmp-dir "./debug-workspace"
```

## 🔄 CI/CD ve Otomatik Release

### GitHub Actions Workflow

Proje, **GitHub Actions** kullanarak otomatik versiyonlama ve release sürecini yönetir. Master branch'ine yapılan her merge işleminde:

1. **Otomatik Tetikleme**: Master branch'ine push veya PR merge
2. **Test ve Build**: Projenin test edilmesi ve build edilmesi
3. **Semantik Versiyonlama**: Patch seviyesinde otomatik versiyon artışı (SemVer)
4. **Git Tag**: Yeni versiyon için otomatik tag oluşturma
5. **GitHub Release**: Otomatik release oluşturma ve asset yükleme
6. **Changelog**: Commit geçmişinden otomatik changelog üretimi

### Workflow Özellikleri

```yaml
# .github/workflows/release.yml
name: Auto Release

on:
  push:
    branches: [master, main]
  pull_request:
    types: [closed]
    branches: [master, main]
```

**Oluşturulan Assets:**
- **NPM Package** (`.tgz`): `npm pack` ile oluşturulan paket
- **Distribution Bundle** (`.zip`): Build edilmiş dosyalar ve dokümantasyon
- **Otomatik Changelog**: Commit geçmişinden üretilen değişiklik listesi

### Versiyonlama Stratejisi

- **Patch Increment**: Her release'de patch versiyon otomatik artırılır
- **SemVer Uyumlu**: `1.0.0` → `1.0.1` → `1.0.2` formatında
- **Git Tag**: Her versiyon için `v1.0.1` formatında tag
- **Commit Messages**: `chore: bump version to v1.0.1` formatında

### Manuel Release

Eğer manuel olarak farklı bir versiyon artışı yapmak isterseniz:

```bash
# Minor versiyon artışı
npm version minor
git push origin master --tags

# Major versiyon artışı
npm version major
git push origin master --tags
```

### Release Asset'leri

Her release'de şu dosyalar otomatik olarak oluşturulur:

- `ado-review-cli-v{version}.tgz` - NPM paketi
- `ado-review-cli-v{version}.zip` - Distribution bundle
- Otomatik changelog ile release notları

## 🤝 Katkıda Bulunma

### Katkı Süreci

1. **Fork** edin
2. **Feature branch** oluşturun (`git checkout -b feature/amazing-feature`)
3. **Commit** edin (`git commit -m 'Add amazing feature'`)
4. **Push** edin (`git push origin feature/amazing-feature`)
5. **Pull Request** açın

### Geliştirme Kuralları

- **TypeScript** kullanın
- **ESLint** kurallarına uyun
- **Test** yazın (minimum %80 coverage)
- **Conventional Commits** formatını kullanın
- **Documentation** güncelleyin

### Commit Mesaj Formatı

```
type(scope): description

[optional body]

[optional footer]
```

**Örnekler:**
```
feat(cli): add --dry-run option
fix(core): handle rate limit errors properly
docs(readme): update installation instructions
test(parser): add validation tests
```

## 📄 Lisans

Bu proje [MIT Lisansı](LICENSE) altında lisanslanmıştır.

## 🙏 Teşekkürler

- **Google Gemini** - AI model desteği için
- **Azure DevOps** - API ve platform desteği için
- **TypeScript** ve **Node.js** topluluğu
- Tüm katkıda bulunanlar

---

**ADO Review CLI** ile kod inceleme sürecinizi AI ile güçlendirin! 🚀

Sorularınız için [Issues](https://github.com/your-org/ado-review-cli/issues) bölümünü kullanabilirsiniz.