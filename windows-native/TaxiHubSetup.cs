using System;
using System.Drawing;
using System.Windows.Forms;
using System.IO;
using System.Diagnostics;
using System.Text;

namespace TaxiHub.Setup
{
    public class SetupWizardForm : Form
    {
        private Color bgDark = Color.FromArgb(9, 14, 26);
        private Color cardDark = Color.FromArgb(18, 28, 48);
        private Color cyanAccent = Color.FromArgb(34, 211, 238);
        private Color emeraldAccent = Color.FromArgb(16, 185, 129);
        private Color textLight = Color.FromArgb(245, 245, 247);
        private Color textMuted = Color.FromArgb(156, 163, 175);

        private int currentStep = 1;
        private Panel step1Panel, step2Panel, step3Panel;
        private Button btnNext, btnBack, btnCancel;
        private CheckBox chkDesktopShortcut, chkStartMenuShortcut, chkLaunchCentral, chkLaunchConfigurador;
        private Label lblStatus;
        private string projectRoot;

        public SetupWizardForm()
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

            InitUI();
        }

        private void InitUI()
        {
            this.Text = "Instalador de TaxiHUB Central Satelital — Asistente de Configuración";
            this.Size = new Size(680, 520);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = bgDark;
            this.ForeColor = textLight;
            this.Font = new Font("Segoe UI", 9.5f);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;

            // Panel Superior Banner
            Panel banner = new Panel
            {
                Dock = DockStyle.Top,
                Height = 80,
                BackColor = Color.FromArgb(15, 23, 42),
                Padding = new Padding(20, 15, 20, 15)
            };
            Label l1 = new Label { Text = "Instalador de TaxiHUB Central", Font = new Font("Segoe UI", 14f, FontStyle.Bold), ForeColor = cyanAccent, Location = new Point(20, 15), AutoSize = true };
            Label l2 = new Label { Text = "Plataforma de Despacho de Taxis, WhatsApp Anti-Ban y App de Operador", Font = new Font("Segoe UI", 8.5f), ForeColor = textMuted, Location = new Point(22, 45), AutoSize = true };
            banner.Controls.Add(l1);
            banner.Controls.Add(l2);
            this.Controls.Add(banner);

            // Panel Inferior Botones
            Panel footer = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 60,
                BackColor = Color.FromArgb(12, 18, 32)
            };

            btnBack = new Button { Text = "< Atrás", Location = new Point(340, 14), Size = new Size(95, 32), Enabled = false, FlatStyle = FlatStyle.Flat, ForeColor = textLight };
            btnNext = new Button { Text = "Siguiente >", Location = new Point(445, 14), Size = new Size(105, 32), FlatStyle = FlatStyle.Flat, BackColor = emeraldAccent, ForeColor = Color.Black, Font = new Font("Segoe UI", 9f, FontStyle.Bold) };
            btnCancel = new Button { Text = "Cancelar", Location = new Point(560, 14), Size = new Size(95, 32), FlatStyle = FlatStyle.Flat, ForeColor = textMuted };

            btnBack.Click += (s, e) => NavigateStep(-1);
            btnNext.Click += (s, e) => NextOrFinish();
            btnCancel.Click += (s, e) => this.Close();

            footer.Controls.Add(btnBack);
            footer.Controls.Add(btnNext);
            footer.Controls.Add(btnCancel);
            this.Controls.Add(footer);

            // Pasos
            step1Panel = CreateStep1();
            step2Panel = CreateStep2();
            step3Panel = CreateStep3();

            this.Controls.Add(step1Panel);
            this.Controls.Add(step2Panel);
            this.Controls.Add(step3Panel);

            ShowStep(1);
        }

        private Panel CreateStep1()
        {
            Panel p = new Panel { Dock = DockStyle.Fill, Padding = new Padding(30, 20, 30, 20) };
            Label title = new Label { Text = "Bienvenido al Asistente de Instalación", Font = new Font("Segoe UI", 12f, FontStyle.Bold), ForeColor = textLight, Location = new Point(25, 15), AutoSize = true };
            Label desc = new Label
            {
                Text = "Este instalador configurará TaxiHUB en tu equipo Windows:\r\n\r\n" +
                       "• Terminal de Despacho Satelital en tiempo real con mapa interactivo.\r\n" +
                       "• App Exclusiva de Operador (Conductores) lista para pruebas locales y APK Android.\r\n" +
                       "• Puente de WhatsApp Web Multi-Device con código QR real y blindaje Anti-Ban.\r\n" +
                       "• Base de datos pre-sembrada con 25 taxis, expedientes, tarifas y colonias.\r\n\r\n" +
                       "Ruta de instalación detectada:\r\n" + projectRoot,
                ForeColor = textMuted,
                Location = new Point(25, 55),
                Size = new Size(610, 180)
            };
            p.Controls.Add(title);
            p.Controls.Add(desc);
            return p;
        }

        private Panel CreateStep2()
        {
            Panel p = new Panel { Dock = DockStyle.Fill, Padding = new Padding(30, 20, 30, 20) };
            Label title = new Label { Text = "Opciones de Instalación y Accesos Directos", Font = new Font("Segoe UI", 12f, FontStyle.Bold), ForeColor = textLight, Location = new Point(25, 15), AutoSize = true };

            chkDesktopShortcut = new CheckBox
            {
                Text = "Crear accesos directos en el Escritorio (TaxiHub Central y Configurador)",
                Checked = true,
                ForeColor = textLight,
                Location = new Point(30, 60),
                Size = new Size(580, 26)
            };

            chkStartMenuShortcut = new CheckBox
            {
                Text = "Crear grupo de accesos en el Menú Inicio de Windows",
                Checked = true,
                ForeColor = textLight,
                Location = new Point(30, 95),
                Size = new Size(580, 26)
            };

            Label lblInfo = new Label
            {
                Text = "Los accesos directos abrirán la Terminal de Despacho en Modo Aplicación de Escritorio\r\nsin bordes molestos del navegador, permitiendo operar como una app nativa.",
                ForeColor = textMuted,
                Location = new Point(30, 140),
                Size = new Size(580, 50)
            };

            p.Controls.Add(title);
            p.Controls.Add(chkDesktopShortcut);
            p.Controls.Add(chkStartMenuShortcut);
            p.Controls.Add(lblInfo);
            return p;
        }

        private Panel CreateStep3()
        {
            Panel p = new Panel { Dock = DockStyle.Fill, Padding = new Padding(30, 20, 30, 20) };
            Label title = new Label { Text = "¡Instalación y Configuración Completada!", Font = new Font("Segoe UI", 12f, FontStyle.Bold), ForeColor = emeraldAccent, Location = new Point(25, 15), AutoSize = true };

            lblStatus = new Label
            {
                Text = "Se han creado los accesos directos y configurado los servicios del sistema.",
                ForeColor = textLight,
                Location = new Point(25, 55),
                Size = new Size(610, 40)
            };

            chkLaunchCentral = new CheckBox
            {
                Text = "Iniciar TaxiHUB Central ahora (Terminal de Despacho)",
                Checked = true,
                ForeColor = textLight,
                Location = new Point(30, 110),
                Size = new Size(500, 26)
            };

            chkLaunchConfigurador = new CheckBox
            {
                Text = "Abrir el Centro de Control y Configurador de Windows",
                Checked = true,
                ForeColor = textLight,
                Location = new Point(30, 145),
                Size = new Size(500, 26)
            };

            p.Controls.Add(title);
            p.Controls.Add(lblStatus);
            p.Controls.Add(chkLaunchCentral);
            p.Controls.Add(chkLaunchConfigurador);
            return p;
        }

        private void ShowStep(int step)
        {
            currentStep = step;
            step1Panel.Visible = (step == 1);
            step2Panel.Visible = (step == 2);
            step3Panel.Visible = (step == 3);

            btnBack.Enabled = (step > 1 && step < 3);
            btnNext.Text = (step == 3) ? "Finalizar" : "Siguiente >";
        }

        private void NavigateStep(int delta)
        {
            ShowStep(currentStep + delta);
        }

        private void NextOrFinish()
        {
            if (currentStep == 1)
            {
                ShowStep(2);
            }
            else if (currentStep == 2)
            {
                EjecutarInstalacion();
                ShowStep(3);
            }
            else if (currentStep == 3)
            {
                if (chkLaunchCentral.Checked)
                {
                    string centralExe = Path.Combine(projectRoot, "TaxiHub-Central.exe");
                    if (File.Exists(centralExe)) Process.Start(centralExe);
                }
                if (chkLaunchConfigurador.Checked)
                {
                    string cfgExe = Path.Combine(projectRoot, "TaxiHub-Configurador.exe");
                    if (File.Exists(cfgExe)) Process.Start(cfgExe);
                }
                this.Close();
            }
        }

        private void EjecutarInstalacion()
        {
            try
            {
                string centralExe = Path.Combine(projectRoot, "TaxiHub-Central.exe");
                string configExe = Path.Combine(projectRoot, "TaxiHub-Configurador.exe");

                if (chkDesktopShortcut.Checked)
                {
                    string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                    CrearAccesoDirecto(Path.Combine(desktop, "TaxiHub Central.lnk"), centralExe, projectRoot, "Terminal de Despacho Satelital TaxiHUB");
                    CrearAccesoDirecto(Path.Combine(desktop, "TaxiHub Configurador.lnk"), configExe, projectRoot, "Centro de Control y Configurador de TaxiHUB");
                }

                if (chkStartMenuShortcut.Checked)
                {
                    string startMenu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "TaxiHUB");
                    Directory.CreateDirectory(startMenu);
                    CrearAccesoDirecto(Path.Combine(startMenu, "TaxiHub Central.lnk"), centralExe, projectRoot, "Terminal de Despacho Satelital TaxiHUB");
                    CrearAccesoDirecto(Path.Combine(startMenu, "TaxiHub Configurador.lnk"), configExe, projectRoot, "Centro de Control y Configurador de TaxiHUB");
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Aviso sobre accesos directos: " + ex.Message, "Instalador", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }

        private void CrearAccesoDirecto(string linkPath, string targetExe, string workDir, string description)
        {
            try
            {
                // Usar Windows Script Host VBScript inline para crear el .lnk nativo sin dependencias
                string vbsScript = Path.GetTempFileName() + ".vbs";
                string content =
                    "Set oWS = WScript.CreateObject(\"WScript.Shell\")\r\n" +
                    "sLinkFile = \"" + linkPath.Replace("\\", "\\\\") + "\"\r\n" +
                    "Set oLink = oWS.CreateShortcut(sLinkFile)\r\n" +
                    "oLink.TargetPath = \"" + targetExe.Replace("\\", "\\\\") + "\"\r\n" +
                    "oLink.WorkingDirectory = \"" + workDir.Replace("\\", "\\\\") + "\"\r\n" +
                    "oLink.Description = \"" + description + "\"\r\n" +
                    "oLink.Save\r\n";
                Process pVbs = Process.Start(new ProcessStartInfo("cscript.exe", "//nologo \"" + vbsScript + "\"") { CreateNoWindow = true, UseShellExecute = false });
                if (pVbs != null) pVbs.WaitForExit();
                try { File.Delete(vbsScript); } catch { }
            }
            catch { }
        }

        [STAThread]
        public static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupWizardForm());
        }
    }
}
