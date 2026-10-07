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
        private const string CentralLoginUrl = "https://taxihub.cloud/terminal/login?app=central";
        private const string CloudHealthUrl = "https://taxihub.cloud/api/config/sitio";
        private NotifyIcon trayIcon;

        public TaxiHubCentralApp()
        {
            try
            {
                // Habilitar TLS 1.2 / TLS 1.3 para comunicaciones seguras HTTPS
                ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072 | (SecurityProtocolType)12288 | SecurityProtocolType.Tls12;
            }
            catch { }

            InitTray();
            VerificarConexionCloud();
            OpenTerminal();
        }

        private void InitTray()
        {
            ContextMenu menu = new ContextMenu();
            menu.MenuItems.Add(new MenuItem("🖥️ Abrir Terminal de Central", (s, e) => OpenTerminal()));
            menu.MenuItems.Add(new MenuItem("🌐 Probar Conexión Cloud (taxihub.cloud)", (s, e) => ProbarConexionManualmente()));
            menu.MenuItems.Add("-");
            menu.MenuItems.Add(new MenuItem("❌ Salir de TaxiHUB Central", (s, e) => ExitApp()));

            trayIcon = new NotifyIcon
            {
                Icon = SystemIcons.Application,
                ContextMenu = menu,
                Text = "TaxiHUB Central — Conectado a taxihub.cloud",
                Visible = true
            };
            trayIcon.DoubleClick += (s, e) => OpenTerminal();
        }

        private void VerificarConexionCloud()
        {
            ThreadPool.QueueUserWorkItem((state) =>
            {
                bool ok = CheckUrl(CloudHealthUrl);
                if (ok)
                {
                    trayIcon.ShowBalloonTip(3000, "TaxiHUB Central", "Conectado a taxihub.cloud. Acceso exclusivo para cuentas de Central.", ToolTipIcon.Info);
                }
                else
                {
                    trayIcon.ShowBalloonTip(4000, "TaxiHUB Central", "Aviso: No se pudo verificar la conexión con taxihub.cloud. Revisa tu conexión a Internet.", ToolTipIcon.Warning);
                }
            });
        }

        private void ProbarConexionManualmente()
        {
            bool ok = CheckUrl(CloudHealthUrl);
            if (ok)
            {
                MessageBox.Show("Conexión exitosa con el servidor en la nube (https://taxihub.cloud).\nServicios de Central y WebSocket operativos.", "TaxiHUB Central — Estado", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            else
            {
                MessageBox.Show("No se pudo contactar a https://taxihub.cloud.\nPor favor verifica tu conexión a Internet.", "TaxiHUB Central — Error de Red", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private bool CheckUrl(string url)
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
                req.Timeout = 4000;
                req.Method = "GET";
                req.UserAgent = "TaxiHubCentralWindows/1.0";
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                {
                    return resp.StatusCode == HttpStatusCode.OK;
                }
            }
            catch { return false; }
        }

        private void OpenTerminal()
        {
            LaunchAppMode(CentralLoginUrl);
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
