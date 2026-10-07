using System;
using System.Drawing;
using System.Windows.Forms;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;

namespace TaxiHub.Central
{
    public class TaxiHubCentralApp : ApplicationContext
    {
        private NotifyIcon trayIcon;
        private string projectRoot;

        public TaxiHubCentralApp()
        {
            projectRoot = AppDomain.CurrentDomain.BaseDirectory;
            if (!File.Exists(Path.Combine(projectRoot, "backend", "server.py")))
            {
                DirectoryInfo pInfo = Directory.GetParent(projectRoot);
                string parent = pInfo != null ? pInfo.FullName : null;
                if (parent != null && File.Exists(Path.Combine(parent, "backend", "server.py")))
                {
                    projectRoot = parent;
                }
            }

            InitTray();
            EnsureServicesRunning();
            OpenTerminal();
        }

        private void InitTray()
        {
            ContextMenu menu = new ContextMenu();
            menu.MenuItems.Add(new MenuItem("🖥️ Abrir Terminal de Despacho", (s, e) => OpenTerminal()));
            menu.MenuItems.Add(new MenuItem("🚖 Abrir App de Operador (3006)", (s, e) => OpenOperador()));
            menu.MenuItems.Add(new MenuItem("⚙️ Abrir Configurador de Central", (s, e) => OpenConfigurador()));
            menu.MenuItems.Add("-");
            menu.MenuItems.Add(new MenuItem("🔄 Reiniciar Servicios", (s, e) => RestartServices()));
            menu.MenuItems.Add(new MenuItem("❌ Salir de TaxiHUB", (s, e) => ExitApp()));

            trayIcon = new NotifyIcon
            {
                Icon = SystemIcons.Application,
                ContextMenu = menu,
                Text = "TaxiHUB Central Satelital (En ejecución)",
                Visible = true
            };
            trayIcon.DoubleClick += (s, e) => OpenTerminal();
        }

        private void EnsureServicesRunning()
        {
            bool backendOk = CheckUrl("http://localhost:8080/api/");
            bool terminalOk = CheckUrl("http://localhost:3005");

            if (!backendOk || !terminalOk)
            {
                trayIcon.ShowBalloonTip(3000, "TaxiHUB Central", "Iniciando servicios en segundo plano...", ToolTipIcon.Info);
                string launcherBat = Path.Combine(projectRoot, "windows-native", "run_services.bat");
                if (File.Exists(launcherBat))
                {
                    ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c \"" + launcherBat + "\"")
                    {
                        WorkingDirectory = projectRoot,
                        CreateNoWindow = true,
                        UseShellExecute = false
                    };
                    Process.Start(psi);
                    Thread.Sleep(2500);
                }
            }
        }

        private bool CheckUrl(string url)
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
                req.Timeout = 1000;
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                {
                    return resp.StatusCode == HttpStatusCode.OK;
                }
            }
            catch { return false; }
        }

        private void OpenTerminal()
        {
            LaunchAppMode("http://localhost:3005/terminal/login");
        }

        private void OpenOperador()
        {
            LaunchAppMode("http://localhost:3006/login");
        }

        private void OpenConfigurador()
        {
            string cfgExe = Path.Combine(projectRoot, "TaxiHub-Configurador.exe");
            if (File.Exists(cfgExe))
            {
                Process.Start(cfgExe);
            }
            else
            {
                string innerExe = Path.Combine(projectRoot, "windows-native", "TaxiHub-Configurador.exe");
                if (File.Exists(innerExe)) Process.Start(innerExe);
            }
        }

        private void LaunchAppMode(string url)
        {
            try
            {
                Process.Start("msedge.exe", "--app=" + url);
            }
            catch
            {
                try
                {
                    Process.Start("chrome.exe", "--app=" + url);
                }
                catch
                {
                    Process.Start(url);
                }
            }
        }

        private void RestartServices()
        {
            trayIcon.ShowBalloonTip(2000, "TaxiHUB", "Reiniciando servicios...", ToolTipIcon.Info);
            try
            {
                Process.Start(new ProcessStartInfo("cmd.exe", "/c for /f \"tokens=5\" %a in ('netstat -aon ^| find \":8080\" ^| find \"LISTENING\"') do taskkill /f /pid %a") { CreateNoWindow = true, UseShellExecute = false });
                Process.Start(new ProcessStartInfo("cmd.exe", "/c for /f \"tokens=5\" %a in ('netstat -aon ^| find \":3005\" ^| find \"LISTENING\"') do taskkill /f /pid %a") { CreateNoWindow = true, UseShellExecute = false });
                Process.Start(new ProcessStartInfo("cmd.exe", "/c for /f \"tokens=5\" %a in ('netstat -aon ^| find \":3006\" ^| find \"LISTENING\"') do taskkill /f /pid %a") { CreateNoWindow = true, UseShellExecute = false });
            }
            catch { }
            Thread.Sleep(1000);
            EnsureServicesRunning();
            trayIcon.ShowBalloonTip(2000, "TaxiHUB", "Servicios reiniciados correctamente.", ToolTipIcon.Info);
        }

        private void ExitApp()
        {
            trayIcon.Visible = false;
            Application.Exit();
        }

        [STAThread]
        public static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new TaxiHubCentralApp());
        }
    }
}
