/**
 * 双人异地联机大富翁 —— 服务器（权威节点）
 * 功能：房间号联机 / 回合制核心 / 随机卡片 / 多地图主题 /
 *       多模式(经典·竞速·合作) / 小游戏格(石头剪刀布·答题) /
 *       断线重连 + 落盘存档
 * 运行：node server.js   (默认端口 3000，可用 PORT 环境变量覆盖)
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PAGE_HTML = Buffer.from('PCFET0NUWVBFIGh0bWw+CjxodG1sIGxhbmc9InpoLUNOIj4KPGhlYWQ+CiAgPG1ldGEgY2hhcnNldD0iVVRGLTgiIC8+CiAgPG1ldGEgbmFtZT0idmlld3BvcnQiIGNvbnRlbnQ9IndpZHRoPWRldmljZS13aWR0aCwgaW5pdGlhbC1zY2FsZT0xLjAsIG1heGltdW0tc2NhbGU9MS4wLCB1c2VyLXNjYWxhYmxlPW5vIiAvPgogIDx0aXRsZT7wn5KVIOWPjOS6uuWkp+WvjOe/gTwvdGl0bGU+CiAgPHN0eWxlPgoqIHsgYm94LXNpemluZzogYm9yZGVyLWJveDsgLXdlYmtpdC10YXAtaGlnaGxpZ2h0LWNvbG9yOiB0cmFuc3BhcmVudDsgfQpodG1sLCBib2R5IHsgbWFyZ2luOiAwOyBwYWRkaW5nOiAwOyB9CmJvZHkgewogIGZvbnQtZmFtaWx5OiAtYXBwbGUtc3lzdGVtLCAiUGluZ0ZhbmcgU0MiLCAiTWljcm9zb2Z0IFlhSGVpIiwgc2Fucy1zZXJpZjsKICBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTYwZGVnLCAjZmZlM2VjIDAlLCAjZTdmMGZmIDEwMCUpOwogIGNvbG9yOiAjMmIyYjNhOwogIG1pbi1oZWlnaHQ6IDEwMHZoOwp9Ci5oaWRkZW4geyBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7IH0KLnNjcmVlbiB7IG1pbi1oZWlnaHQ6IDEwMHZoOyBkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsgcGFkZGluZzogMTZweDsgfQoKLmNhcmQgewogIGJhY2tncm91bmQ6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDIwcHg7IHBhZGRpbmc6IDI0cHg7CiAgd2lkdGg6IDEwMCU7IG1heC13aWR0aDogNDIwcHg7IGJveC1zaGFkb3c6IDAgMTJweCA0MHB4IHJnYmEoMCwwLDAsLjEyKTsKICB0ZXh0LWFsaWduOiBjZW50ZXI7Cn0KaDEgeyBtYXJnaW46IDAgMCA0cHg7IGZvbnQtc2l6ZTogMjZweDsgfQpoMiB7IG1hcmdpbjogMCAwIDEycHg7IH0KLnN1YiB7IGNvbG9yOiAjODg4OyBtYXJnaW46IDZweCAwIDE4cHg7IGZvbnQtc2l6ZTogMTRweDsgfQpsYWJlbCB7IGRpc3BsYXk6IGJsb2NrOyB0ZXh0LWFsaWduOiBsZWZ0OyBmb250LXNpemU6IDEzcHg7IGNvbG9yOiAjNjY2OyBtYXJnaW46IDE0cHggMCA2cHg7IH0KaW5wdXQgewogIHdpZHRoOiAxMDAlOyBwYWRkaW5nOiAxMnB4IDE0cHg7IGJvcmRlcjogMS41cHggc29saWQgI2UzZTNlZjsgYm9yZGVyLXJhZGl1czogMTJweDsKICBmb250LXNpemU6IDE2cHg7IG91dGxpbmU6IG5vbmU7Cn0KaW5wdXQ6Zm9jdXMgeyBib3JkZXItY29sb3I6ICNmZjVlN2U7IH0KCmJ1dHRvbiB7CiAgZm9udC1zaXplOiAxNnB4OyBib3JkZXI6IG5vbmU7IGJvcmRlci1yYWRpdXM6IDEycHg7IHBhZGRpbmc6IDEycHggMThweDsKICBjdXJzb3I6IHBvaW50ZXI7IHRyYW5zaXRpb246IHRyYW5zZm9ybSAuMDhzLCBvcGFjaXR5IC4yczsgZm9udC13ZWlnaHQ6IDYwMDsKfQpidXR0b246YWN0aXZlIHsgdHJhbnNmb3JtOiBzY2FsZSguOTYpOyB9Ci5wcmltYXJ5IHsgYmFja2dyb3VuZDogI2ZmNWU3ZTsgY29sb3I6ICNmZmY7IH0KLmdob3N0IHsgYmFja2dyb3VuZDogI2VlZjBmNjsgY29sb3I6ICM1NTU7IH0KLmJpZyB7IHBhZGRpbmc6IDE2cHg7IGZvbnQtc2l6ZTogMThweDsgd2lkdGg6IDEwMCU7IH0KLmRpdmlkZXIgeyBjb2xvcjogI2FhYTsgbWFyZ2luOiAxOHB4IDAgNnB4OyBmb250LXNpemU6IDEzcHg7IH0KLmpvaW4tcm93IHsgZGlzcGxheTogZmxleDsgZ2FwOiA4cHg7IH0KLmpvaW4tcm93IGlucHV0IHsgdGV4dC10cmFuc2Zvcm06IHVwcGVyY2FzZTsgfQouam9pbi1yb3cgYnV0dG9uIHsgYmFja2dyb3VuZDogIzNiODJmNjsgY29sb3I6ICNmZmY7IHdoaXRlLXNwYWNlOiBub3dyYXA7IH0KCi50aGVtZXMgeyBkaXNwbGF5OiBmbGV4OyBnYXA6IDEwcHg7IH0KLnRoZW1lLWJ0biB7IGZsZXg6IDE7IGJhY2tncm91bmQ6ICNmMWYyZjg7IGNvbG9yOiAjNTU1OyBib3JkZXI6IDJweCBzb2xpZCB0cmFuc3BhcmVudDsgfQoudGhlbWUtYnRuLmFjdGl2ZSB7IGJhY2tncm91bmQ6ICNmZmYwZjQ7IGJvcmRlci1jb2xvcjogI2ZmNWU3ZTsgY29sb3I6ICNmZjVlN2U7IH0KLm1vZGUtYnRuIHsgZmxleDogMTsgYmFja2dyb3VuZDogI2YxZjJmODsgY29sb3I6ICM1NTU7IGJvcmRlcjogMnB4IHNvbGlkIHRyYW5zcGFyZW50OyBmb250LXNpemU6IDEzcHg7IHBhZGRpbmc6IDEwcHggNHB4OyB9Ci5tb2RlLWJ0bi5hY3RpdmUgeyBiYWNrZ3JvdW5kOiAjZWFmNmZmOyBib3JkZXItY29sb3I6ICMzYjgyZjY7IGNvbG9yOiAjM2I4MmY2OyB9CgoubXNnIHsgY29sb3I6ICNlMjM7IGZvbnQtc2l6ZTogMTNweDsgbWluLWhlaWdodDogMThweDsgbWFyZ2luLXRvcDogMTJweDsgfQouY29kZSB7CiAgZm9udC1zaXplOiAzNHB4OyBsZXR0ZXItc3BhY2luZzogNnB4OyBmb250LXdlaWdodDogODAwOyBjb2xvcjogI2ZmNWU3ZTsKICBiYWNrZ3JvdW5kOiAjZmZmMGY0OyBib3JkZXItcmFkaXVzOiAxNHB4OyBwYWRkaW5nOiAxNHB4OyBtYXJnaW46IDE0cHggMDsKfQoucGxheWVycy1taW5pIHsgZGlzcGxheTogZmxleDsgZ2FwOiAxMHB4OyBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsgbWFyZ2luLXRvcDogMTBweDsgfQoKLyogPT09PT0g5ri45oiP55WM6Z2iID09PT09ICovCiNnYW1lIHsgZGlzcGxheTogYmxvY2s7IHBhZGRpbmc6IDEwcHg7IG1heC13aWR0aDogNTYwcHg7IG1hcmdpbjogMCBhdXRvOyB9Ci50b3BiYXIgeyBkaXNwbGF5OiBmbGV4OyBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47IGFsaWduLWl0ZW1zOiBjZW50ZXI7IG1hcmdpbi1ib3R0b206IDhweDsgfQoucm9vbSB7IGZvbnQtc2l6ZTogMTRweDsgY29sb3I6ICM2NjY7IH0KLnJvb20gYiB7IGNvbG9yOiAjZmY1ZTdlOyBsZXR0ZXItc3BhY2luZzogMnB4OyB9Ci50dXJuIHsgZm9udC1zaXplOiAxNHB4OyBmb250LXdlaWdodDogNzAwOyBjb2xvcjogIzNiODJmNjsgfQoKLnBsYXllcnMgeyBkaXNwbGF5OiBmbGV4OyBnYXA6IDEwcHg7IG1hcmdpbi1ib3R0b206IDEwcHg7IH0KLnBib3ggewogIGZsZXg6IDE7IGJhY2tncm91bmQ6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDE0cHg7IHBhZGRpbmc6IDEwcHggMTJweDsgYm94LXNoYWRvdzogMCA0cHggMTRweCByZ2JhKDAsMCwwLC4wOCk7CiAgYm9yZGVyOiAycHggc29saWQgdHJhbnNwYXJlbnQ7Cn0KLnBib3guYWN0aXZlIHsgYm9yZGVyLWNvbG9yOiAjZmZkMjNmOyB9Ci5wYm94IC5wbmFtZSB7IGZvbnQtd2VpZ2h0OiA3MDA7IGZvbnQtc2l6ZTogMTVweDsgZGlzcGxheTogZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgZ2FwOiA2cHg7IH0KLmRvdCB7IHdpZHRoOiAxMnB4OyBoZWlnaHQ6IDEycHg7IGJvcmRlci1yYWRpdXM6IDUwJTsgZGlzcGxheTogaW5saW5lLWJsb2NrOyB9Ci5wYm94IC5wbW9uZXkgeyBmb250LXNpemU6IDIwcHg7IGZvbnQtd2VpZ2h0OiA4MDA7IG1hcmdpbi10b3A6IDJweDsgfQoucGJveCAucGluZm8geyBmb250LXNpemU6IDEycHg7IGNvbG9yOiAjODg4OyBtYXJnaW4tdG9wOiAycHg7IH0KLnBib3guYnJva2UgeyBvcGFjaXR5OiAuNTsgfQoKLyog5qOL55uYICovCi5ib2FyZCB7CiAgZGlzcGxheTogZ3JpZDsgZ3JpZC10ZW1wbGF0ZS1jb2x1bW5zOiByZXBlYXQoNSwgMWZyKTsgZ2FwOiA2cHg7IG1hcmdpbi1ib3R0b206IDEwcHg7Cn0KLnRpbGUgewogIGJhY2tncm91bmQ6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDEwcHg7IHBhZGRpbmc6IDZweCA0cHg7IG1pbi1oZWlnaHQ6IDUycHg7CiAgZm9udC1zaXplOiAxMXB4OyB0ZXh0LWFsaWduOiBjZW50ZXI7IHBvc2l0aW9uOiByZWxhdGl2ZTsgYm94LXNoYWRvdzogMCAycHggNnB4IHJnYmEoMCwwLDAsLjA2KTsKICBkaXNwbGF5OiBmbGV4OyBmbGV4LWRpcmVjdGlvbjogY29sdW1uOyBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47Cn0KLnRpbGUgLnRuYW1lIHsgZm9udC13ZWlnaHQ6IDYwMDsgbGluZS1oZWlnaHQ6IDEuMjsgfQoudGlsZSAudHR5cGUgeyBmb250LXNpemU6IDlweDsgY29sb3I6ICNhYWE7IH0KLnRpbGUgLm93bmVyLWJhciB7IGhlaWdodDogNHB4OyBib3JkZXItcmFkaXVzOiAycHg7IG1hcmdpbi10b3A6IDNweDsgfQoudGlsZSAubHYgeyBmb250LXNpemU6IDlweDsgY29sb3I6ICNmZjVlN2U7IGZvbnQtd2VpZ2h0OiA3MDA7IH0KLnRpbGUgLnRva2VucyB7IHBvc2l0aW9uOiBhYnNvbHV0ZTsgdG9wOiAycHg7IHJpZ2h0OiAzcHg7IGZvbnQtc2l6ZTogMTFweDsgfQoudGlsZS5wcm9wZXJ0eSB7IGJvcmRlci1sZWZ0OiA0cHggc29saWQgI2ZmZDIzZjsgfQoudGlsZS5nbyB7IGJhY2tncm91bmQ6ICNmZmY3ZTY7IH0KLnRpbGUuamFpbCwgLnRpbGUuZ290b2phaWwgeyBiYWNrZ3JvdW5kOiAjZmZlOWU5OyB9Ci50aWxlLnBhcmsgeyBiYWNrZ3JvdW5kOiAjZTlmZmYwOyB9Ci50aWxlLnRheCB7IGJhY2tncm91bmQ6ICNmZmYwZTk7IH0KLnRpbGUuY2hhbmNlIHsgYmFja2dyb3VuZDogI2U5ZjNmZjsgfQoudGlsZS5kZXN0aW55IHsgYmFja2dyb3VuZDogI2YzZTlmZjsgfQoKLmV2ZW50IHsKICBiYWNrZ3JvdW5kOiAjZmZmOyBib3JkZXItcmFkaXVzOiAxMnB4OyBwYWRkaW5nOiAxMnB4OyBtYXJnaW4tYm90dG9tOiAxMHB4OyB0ZXh0LWFsaWduOiBjZW50ZXI7CiAgZm9udC13ZWlnaHQ6IDYwMDsgYm94LXNoYWRvdzogMCA0cHggMTRweCByZ2JhKDAsMCwwLC4wOCk7IGFuaW1hdGlvbjogcG9wIC4yczsKfQpAa2V5ZnJhbWVzIHBvcCB7IGZyb20geyB0cmFuc2Zvcm06IHNjYWxlKC45KTsgb3BhY2l0eTogMDsgfSB0byB7IHRyYW5zZm9ybTogc2NhbGUoMSk7IG9wYWNpdHk6IDE7IH0gfQoKLmNvbnRyb2xzIHsgbWFyZ2luLWJvdHRvbTogMTBweDsgfQouYnV5Ym94IHsgZGlzcGxheTogZmxleDsgZ2FwOiA4cHg7IH0KLmJ1eWJveCBidXR0b24geyBmbGV4OiAxOyB9CgoubG9nd3JhcCwgLmNoYXR3cmFwIHsgYmFja2dyb3VuZDogI2ZmZjsgYm9yZGVyLXJhZGl1czogMTJweDsgcGFkZGluZzogMTBweCAxMnB4OyBtYXJnaW4tYm90dG9tOiAxMHB4OyBib3gtc2hhZG93OiAwIDRweCAxNHB4IHJnYmEoMCwwLDAsLjA2KTsgfQpzdW1tYXJ5IHsgY3Vyc29yOiBwb2ludGVyOyBmb250LXdlaWdodDogNjAwOyBmb250LXNpemU6IDE0cHg7IH0KLmxvZyB7IG1heC1oZWlnaHQ6IDE2MHB4OyBvdmVyZmxvdy15OiBhdXRvOyB0ZXh0LWFsaWduOiBsZWZ0OyBmb250LXNpemU6IDEycHg7IGNvbG9yOiAjNTU1OyBtYXJnaW4tdG9wOiA4cHg7IH0KLmxvZyBkaXYgeyBwYWRkaW5nOiAycHggMDsgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkICNmMGYwZjU7IH0KLmNoYXRsb2cgeyBtYXgtaGVpZ2h0OiAxNDBweDsgb3ZlcmZsb3cteTogYXV0bzsgdGV4dC1hbGlnbjogbGVmdDsgZm9udC1zaXplOiAxM3B4OyBtYXJnaW46IDhweCAwOyB9Ci5jaGF0bG9nIGRpdiB7IG1hcmdpbjogNHB4IDA7IH0KLmNoYXRyb3cgeyBkaXNwbGF5OiBmbGV4OyBnYXA6IDZweDsgfQouY2hhdHJvdyBpbnB1dCB7IGZsZXg6IDE7IH0KLmNoYXRyb3cgYnV0dG9uIHsgYmFja2dyb3VuZDogIzNiODJmNjsgY29sb3I6ICNmZmY7IH0KCiNvdmVyIC5jYXJkIGgxIHsgZm9udC1zaXplOiAzMHB4OyB9CgovKiDlsI/muLjmiI/lvLnlsYIgKi8KLm1pbmlnYW1lIHsgYmFja2dyb3VuZDojZmZmOyBib3JkZXItcmFkaXVzOjE0cHg7IHBhZGRpbmc6MTRweDsgbWFyZ2luLWJvdHRvbToxMHB4OyBib3gtc2hhZG93OjAgNHB4IDE0cHggcmdiYSgwLDAsMCwuMDgpOyB9Ci5tZ3RpdGxlIHsgZm9udC13ZWlnaHQ6ODAwOyBmb250LXNpemU6MTZweDsgdGV4dC1hbGlnbjpjZW50ZXI7IG1hcmdpbi1ib3R0b206NnB4OyB9Ci5tZ3N1YiB7IHRleHQtYWxpZ246Y2VudGVyOyBmb250LXNpemU6MTRweDsgY29sb3I6IzU1NTsgbWFyZ2luOjZweCAwOyB9Ci5ycHMtcm93IHsgZGlzcGxheTpmbGV4OyBnYXA6MTBweDsganVzdGlmeS1jb250ZW50OmNlbnRlcjsgfQoucnBzLWJ0biB7IGZvbnQtc2l6ZTozMHB4OyB3aWR0aDo2NHB4OyBoZWlnaHQ6NjRweDsgYm9yZGVyLXJhZGl1czoxNnB4OyBiYWNrZ3JvdW5kOiNmZmYwZjQ7IH0KLnF1aXotb3B0cyB7IGRpc3BsYXk6ZmxleDsgZmxleC1kaXJlY3Rpb246Y29sdW1uOyBnYXA6OHB4OyBtYXJnaW4tdG9wOjhweDsgfQoucXVpei1vcHRzIGJ1dHRvbiB7IGJhY2tncm91bmQ6I2YxZjJmODsgY29sb3I6IzMzMzsgdGV4dC1hbGlnbjpsZWZ0OyB9CgovKiDpga7nvakgKi8KLm92ZXJsYXkgeyBwb3NpdGlvbjpmaXhlZDsgaW5zZXQ6MDsgYmFja2dyb3VuZDpyZ2JhKDI1NSwyNTUsMjU1LC45Mik7IGRpc3BsYXk6ZmxleDsgYWxpZ24taXRlbXM6Y2VudGVyOyBqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyOyB6LWluZGV4OjUwOyBwYWRkaW5nOjE2cHg7IH0KICA8L3N0eWxlPgo8L2hlYWQ+Cjxib2R5PgogIDwhLS0g55m75b2VL+W7uuaIv+eVjOmdoiAtLT4KICA8ZGl2IGlkPSJsb2JieSIgY2xhc3M9InNjcmVlbiI+CiAgICA8ZGl2IGNsYXNzPSJjYXJkIj4KICAgICAgPGgxPvCfkpUg5Y+M5Lq65aSn5a+M57+BPC9oMT4KICAgICAgPHAgY2xhc3M9InN1YiI+5byC5Zyw5Lmf6IO95LiA6LW3546p55qE5bCP5ri45oiPPC9wPgoKICAgICAgPGxhYmVsPuS9oOeahOaYteensDwvbGFiZWw+CiAgICAgIDxpbnB1dCBpZD0ibmFtZSIgbWF4bGVuZ3RoPSI4IiBwbGFjZWhvbGRlcj0i5L6L5aaC77ya5a6d6LSdIC8g5oiRIiAvPgoKICAgICAgPGxhYmVsPumAieaLqeWcsOWbvuS4u+mimDwvbGFiZWw+CiAgICAgIDxkaXYgY2xhc3M9InRoZW1lcyI+CiAgICAgICAgPGJ1dHRvbiBjbGFzcz0idGhlbWUtYnRuIGFjdGl2ZSIgZGF0YS10aGVtZT0iY2l0eSI+8J+Pme+4jyDln47luILlhpLpmak8L2J1dHRvbj4KICAgICAgICA8YnV0dG9uIGNsYXNzPSJ0aGVtZS1idG4iIGRhdGEtdGhlbWU9ImNhbXB1cyI+8J+OkyDmoKHlm63ml7blhYk8L2J1dHRvbj4KICAgICAgPC9kaXY+CgogICAgICA8bGFiZWw+6YCJ5oup546p5rOV5qih5byPPC9sYWJlbD4KICAgICAgPGRpdiBjbGFzcz0idGhlbWVzIj4KICAgICAgICA8YnV0dG9uIGNsYXNzPSJtb2RlLWJ0biBhY3RpdmUiIGRhdGEtbW9kZT0iY2xhc3NpYyI+4pqU77iPIOe7j+WFuOWvueaImDwvYnV0dG9uPgogICAgICAgIDxidXR0b24gY2xhc3M9Im1vZGUtYnRuIiBkYXRhLW1vZGU9InJhY2UiPvCfj4Eg56ue6YCfPC9idXR0b24+CiAgICAgICAgPGJ1dHRvbiBjbGFzcz0ibW9kZS1idG4iIGRhdGEtbW9kZT0iY29vcCI+8J+knSDlkIjkvZw8L2J1dHRvbj4KICAgICAgPC9kaXY+CgogICAgICA8YnV0dG9uIGlkPSJjcmVhdGVCdG4iIGNsYXNzPSJwcmltYXJ5Ij7liJvlu7rmiL/pl7Q8L2J1dHRvbj4KICAgICAgPGRpdiBjbGFzcz0iZGl2aWRlciI+4oCUIOaIliDigJQ8L2Rpdj4KICAgICAgPGxhYmVsPui+k+WFpeaIv+mXtOWPt+WKoOWFpTwvbGFiZWw+CiAgICAgIDxkaXYgY2xhc3M9ImpvaW4tcm93Ij4KICAgICAgICA8aW5wdXQgaWQ9ImpvaW5Db2RlIiBtYXhsZW5ndGg9IjYiIHBsYWNlaG9sZGVyPSI25L2N5oi/6Ze05Y+3IiAvPgogICAgICAgIDxidXR0b24gaWQ9ImpvaW5CdG4iPuWKoOWFpTwvYnV0dG9uPgogICAgICA8L2Rpdj4KICAgICAgPHAgaWQ9ImxvYmJ5TXNnIiBjbGFzcz0ibXNnIj48L3A+CiAgICA8L2Rpdj4KICA8L2Rpdj4KCiAgPCEtLSDnrYnlvoXnlYzpnaIgLS0+CiAgPGRpdiBpZD0id2FpdGluZyIgY2xhc3M9InNjcmVlbiBoaWRkZW4iPgogICAgPGRpdiBjbGFzcz0iY2FyZCI+CiAgICAgIDxoMj7miL/pl7Tlt7LliJvlu7o8L2gyPgogICAgICA8cD7miormiL/pl7Tlj7flj5Hnu5nlr7nmlrnvvIxUQSDovpPlhaXljbPlj6/liqDlhaXvvJo8L3A+CiAgICAgIDxkaXYgaWQ9InJvb21Db2RlIiBjbGFzcz0iY29kZSI+LS0tLS0tPC9kaXY+CiAgICAgIDxwIGNsYXNzPSJzdWIiPuetieW+heWvueaWueWKoOWFpeS4reKApjwvcD4KICAgICAgPGRpdiBpZD0id2FpdFBsYXllcnMiIGNsYXNzPSJwbGF5ZXJzLW1pbmkiPjwvZGl2PgogICAgPC9kaXY+CiAgPC9kaXY+CgogIDwhLS0g5ri45oiP55WM6Z2iIC0tPgogIDxkaXYgaWQ9ImdhbWUiIGNsYXNzPSJzY3JlZW4gaGlkZGVuIj4KICAgIDxkaXYgY2xhc3M9InRvcGJhciI+CiAgICAgIDxkaXYgY2xhc3M9InJvb20iPuaIv+mXtCA8YiBpZD0iZ0NvZGUiPi0tLS08L2I+PC9kaXY+CiAgICAgIDxkaXYgaWQ9InR1cm5JbmZvIiBjbGFzcz0idHVybiI+PC9kaXY+CiAgICA8L2Rpdj4KCiAgICA8ZGl2IGNsYXNzPSJwbGF5ZXJzIj4KICAgICAgPGRpdiBpZD0icDAiIGNsYXNzPSJwYm94Ij48L2Rpdj4KICAgICAgPGRpdiBpZD0icDEiIGNsYXNzPSJwYm94Ij48L2Rpdj4KICAgIDwvZGl2PgoKICAgIDxkaXYgaWQ9ImJvYXJkIiBjbGFzcz0iYm9hcmQiPjwvZGl2PgoKICAgIDxkaXYgaWQ9ImV2ZW50IiBjbGFzcz0iZXZlbnQgaGlkZGVuIj48L2Rpdj4KCiAgICA8IS0tIOWwj+a4uOaIj+W8ueWxgiAtLT4KICAgIDxkaXYgaWQ9Im1pbmlHYW1lIiBjbGFzcz0ibWluaWdhbWUgaGlkZGVuIj4KICAgICAgPGRpdiBpZD0icnBzQm94IiBjbGFzcz0ibWdib3ggaGlkZGVuIj4KICAgICAgICA8ZGl2IGNsYXNzPSJtZ3RpdGxlIj7wn46uIOefs+WktOWJquWIgOW4gzwvZGl2PgogICAgICAgIDxkaXYgaWQ9InJwc1N0YXR1cyIgY2xhc3M9Im1nc3ViIj48L2Rpdj4KICAgICAgICA8ZGl2IGNsYXNzPSJycHMtcm93Ij4KICAgICAgICAgIDxidXR0b24gY2xhc3M9InJwcy1idG4iIGRhdGEtcnBzPSJyb2NrIj7inIo8L2J1dHRvbj4KICAgICAgICAgIDxidXR0b24gY2xhc3M9InJwcy1idG4iIGRhdGEtcnBzPSJwYXBlciI+4pyLPC9idXR0b24+CiAgICAgICAgICA8YnV0dG9uIGNsYXNzPSJycHMtYnRuIiBkYXRhLXJwcz0ic2Npc3NvcnMiPuKcjO+4jzwvYnV0dG9uPgogICAgICAgIDwvZGl2PgogICAgICAgIDxkaXYgaWQ9InJwc1Jlc3VsdCIgY2xhc3M9Im1nc3ViIj48L2Rpdj4KICAgICAgPC9kaXY+CiAgICAgIDxkaXYgaWQ9InF1aXpCb3giIGNsYXNzPSJtZ2JveCBoaWRkZW4iPgogICAgICAgIDxkaXYgY2xhc3M9Im1ndGl0bGUiPvCfp6Ag562U6aKY5oyR5oiYPC9kaXY+CiAgICAgICAgPGRpdiBpZD0icXVpelEiIGNsYXNzPSJtZ3N1YiI+PC9kaXY+CiAgICAgICAgPGRpdiBpZD0icXVpek9wdHMiIGNsYXNzPSJxdWl6LW9wdHMiPjwvZGl2PgogICAgICAgIDxkaXYgaWQ9InF1aXpSZXN1bHQiIGNsYXNzPSJtZ3N1YiI+PC9kaXY+CiAgICAgIDwvZGl2PgogICAgPC9kaXY+CgogICAgPGRpdiBjbGFzcz0iY29udHJvbHMiPgogICAgICA8YnV0dG9uIGlkPSJyb2xsQnRuIiBjbGFzcz0icHJpbWFyeSBiaWciPvCfjrIg5o636aqw5a2QPC9idXR0b24+CiAgICAgIDxkaXYgaWQ9ImJ1eUJveCIgY2xhc3M9ImJ1eWJveCBoaWRkZW4iPgogICAgICAgIDxidXR0b24gaWQ9ImJ1eVllcyIgY2xhc3M9InByaW1hcnkiPuS5sOS4iyAo6Iqx6LS5IDxzcGFuIGlkPSJidXlQcmljZSI+PC9zcGFuPik8L2J1dHRvbj4KICAgICAgICA8YnV0dG9uIGlkPSJidXlObyIgY2xhc3M9Imdob3N0Ij7mlL7lvIM8L2J1dHRvbj4KICAgICAgPC9kaXY+CiAgICAgIDxkaXYgaWQ9ImphaWxCb3giIGNsYXNzPSJidXlib3ggaGlkZGVuIj4KICAgICAgICA8YnV0dG9uIGlkPSJqYWlsUGF5IiBjbGFzcz0icHJpbWFyeSI+5Lqk5L+d6YeK6YeRNTDlh7rni7E8L2J1dHRvbj4KICAgICAgICA8YnV0dG9uIGlkPSJqYWlsV2FpdCIgY2xhc3M9Imdob3N0Ij7lho3lhbPkuIDlm57lkIg8L2J1dHRvbj4KICAgICAgPC9kaXY+CiAgICA8L2Rpdj4KCiAgICA8ZGV0YWlscyBjbGFzcz0ibG9nd3JhcCI+CiAgICAgIDxzdW1tYXJ5PvCfk5wg5ri45oiP6K6w5b2VPC9zdW1tYXJ5PgogICAgICA8ZGl2IGlkPSJsb2ciIGNsYXNzPSJsb2ciPjwvZGl2PgogICAgPC9kZXRhaWxzPgoKICAgIDxkZXRhaWxzIGNsYXNzPSJjaGF0d3JhcCI+CiAgICAgIDxzdW1tYXJ5PvCfkqwg5oKE5oKE6K+dPC9zdW1tYXJ5PgogICAgICA8ZGl2IGlkPSJjaGF0TG9nIiBjbGFzcz0iY2hhdGxvZyI+PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9ImNoYXRyb3ciPgogICAgICAgIDxpbnB1dCBpZD0iY2hhdElucHV0IiBwbGFjZWhvbGRlcj0i6K+054K55LuA5LmI4oCmIiAvPgogICAgICAgIDxidXR0b24gaWQ9ImNoYXRTZW5kIj7lj5HpgIE8L2J1dHRvbj4KICAgICAgPC9kaXY+CiAgICA8L2RldGFpbHM+CiAgPC9kaXY+CgogIDwhLS0g57uT566X55WM6Z2iIC0tPgogIDxkaXYgaWQ9Im92ZXIiIGNsYXNzPSJzY3JlZW4gaGlkZGVuIj4KICAgIDxkaXYgY2xhc3M9ImNhcmQiPgogICAgICA8aDEgaWQ9IndpblRleHQiPvCfjok8L2gxPgogICAgICA8YnV0dG9uIGlkPSJhZ2FpbkJ0biIgY2xhc3M9InByaW1hcnkiPuWGjeadpeS4gOWxgDwvYnV0dG9uPgogICAgPC9kaXY+CiAgPC9kaXY+CgogIDwhLS0g6YeN6L+e5o+Q56S66YGu572pIC0tPgogIDxkaXYgaWQ9Im92ZXJsYXkiIGNsYXNzPSJvdmVybGF5IGhpZGRlbiI+CiAgICA8ZGl2IGNsYXNzPSJjYXJkIj4KICAgICAgPGgyIGlkPSJvdmVybGF5VGl0bGUiPuato+WcqOmHjei/nuKApjwvaDI+CiAgICAgIDxwIGlkPSJvdmVybGF5TXNnIiBjbGFzcz0ic3ViIj48L3A+CiAgICA8L2Rpdj4KICA8L2Rpdj4KCiAgPHNjcmlwdCBzcmM9Ii9zb2NrZXQuaW8vc29ja2V0LmlvLmpzIj48L3NjcmlwdD4KICA8c2NyaXB0PgovKiDlj4zkurrlpKflr4znv4Eg4oCU4oCUIOWuouaIt+err+mAu+i+ke+8iOWQq+WkmuaooeW8jyAvIOWwj+a4uOaIjyAvIOaWree6v+mHjei/nu+8iSAqLwpjb25zdCBzb2NrZXQgPSBpbygpOwoKbGV0IG15TmFtZSA9ICcnOwpsZXQgc2VsZWN0ZWRUaGVtZSA9ICdjaXR5JzsKbGV0IHNlbGVjdGVkTW9kZSA9ICdjbGFzc2ljJzsKbGV0IGN1cnJlbnRTdGF0ZSA9IG51bGw7CmNvbnN0IFNFU1NJT05fS0VZID0gJ2xtX3Nlc3Npb24nOwoKLyogLS0tLS0tLS0tLSDlpKfljoUgLS0tLS0tLS0tLSAqLwpkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcudGhlbWUtYnRuJykuZm9yRWFjaCgoYikgPT4gewogIGIub25jbGljayA9ICgpID0+IHsKICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy50aGVtZS1idG4nKS5mb3JFYWNoKCh4KSA9PiB4LmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpKTsKICAgIGIuY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7CiAgICBzZWxlY3RlZFRoZW1lID0gYi5kYXRhc2V0LnRoZW1lOwogIH07Cn0pOwpkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcubW9kZS1idG4nKS5mb3JFYWNoKChiKSA9PiB7CiAgYi5vbmNsaWNrID0gKCkgPT4gewogICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLm1vZGUtYnRuJykuZm9yRWFjaCgoeCkgPT4geC5jbGFzc0xpc3QucmVtb3ZlKCdhY3RpdmUnKSk7CiAgICBiLmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpOwogICAgc2VsZWN0ZWRNb2RlID0gYi5kYXRhc2V0Lm1vZGU7CiAgfTsKfSk7Cgpkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY3JlYXRlQnRuJykub25jbGljayA9ICgpID0+IHsKICBteU5hbWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbmFtZScpLnZhbHVlLnRyaW0oKSB8fCAn546p5a62JzsKICBzb2NrZXQuZW1pdCgnY3JlYXRlUm9vbScsIHsgbmFtZTogbXlOYW1lLCB0aGVtZTogc2VsZWN0ZWRUaGVtZSwgbW9kZTogc2VsZWN0ZWRNb2RlIH0pOwp9Owpkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnam9pbkJ0bicpLm9uY2xpY2sgPSAoKSA9PiB7CiAgY29uc3QgY29kZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdqb2luQ29kZScpLnZhbHVlLnRyaW0oKS50b1VwcGVyQ2FzZSgpOwogIG15TmFtZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCduYW1lJykudmFsdWUudHJpbSgpIHx8ICfnjqnlrrYnOwogIGlmICghY29kZSkgcmV0dXJuIHNob3dMb2JieU1zZygn6K+36L6T5YWl5oi/6Ze05Y+3Jyk7CiAgc29ja2V0LmVtaXQoJ2pvaW5Sb29tJywgeyBjb2RlLCBuYW1lOiBteU5hbWUgfSk7Cn07CmZ1bmN0aW9uIHNob3dMb2JieU1zZyh0KSB7IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2JieU1zZycpLnRleHRDb250ZW50ID0gdDsgfQoKLyogLS0tLS0tLS0tLSDph43ov57vvIhsb2NhbFN0b3JhZ2Ug5Lya6K+d77yJIC0tLS0tLS0tLS0gKi8KZnVuY3Rpb24gc2F2ZVNlc3Npb24ocykgewogIGNvbnN0IG1lID0gcy5wbGF5ZXJzLmZpbmQoKHApID0+IHAuaXNZb3UpOwogIGlmIChtZSAmJiBtZS50b2tlbikgewogICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oU0VTU0lPTl9LRVksIEpTT04uc3RyaW5naWZ5KHsgY29kZTogcy5jb2RlLCB0b2tlbjogbWUudG9rZW4sIG5hbWU6IG1lLm5hbWUgfSkpOwogIH0KfQpmdW5jdGlvbiBsb2FkU2Vzc2lvbigpIHsKICB0cnkgeyByZXR1cm4gSlNPTi5wYXJzZShsb2NhbFN0b3JhZ2UuZ2V0SXRlbShTRVNTSU9OX0tFWSkpOyB9IGNhdGNoIHsgcmV0dXJuIG51bGw7IH0KfQpmdW5jdGlvbiBjbGVhclNlc3Npb24oKSB7IGxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKFNFU1NJT05fS0VZKTsgfQoKZnVuY3Rpb24gc2hvd092ZXJsYXkodGl0bGUsIG1zZykgewogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdvdmVybGF5VGl0bGUnKS50ZXh0Q29udGVudCA9IHRpdGxlOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdvdmVybGF5TXNnJykudGV4dENvbnRlbnQgPSBtc2cgfHwgJyc7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ292ZXJsYXknKS5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTsKfQpmdW5jdGlvbiBoaWRlT3ZlcmxheSgpIHsgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ292ZXJsYXknKS5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTsgfQoKLy8g6aG16Z2i5Yqg6L295pe26Iul5pyJ5a2Y5qGj5Lya6K+d77yM6Ieq5Yqo6YeN6L+eCmNvbnN0IHNhdmVkID0gbG9hZFNlc3Npb24oKTsKaWYgKHNhdmVkICYmIHNhdmVkLmNvZGUgJiYgc2F2ZWQudG9rZW4pIHsKICBzaG93T3ZlcmxheSgn5q2j5Zyo6YeN6L+e4oCmJywgJ+aBouWkjeWIsOS5i+WJjeeahOaIv+mXtCcpOwogIGNvbnN0IGRvUmVjb25uZWN0ID0gKCkgPT4gc29ja2V0LmVtaXQoJ3JlY29ubmVjdCcsIHsgY29kZTogc2F2ZWQuY29kZSwgdG9rZW46IHNhdmVkLnRva2VuLCBuYW1lOiBteU5hbWUgfSk7CiAgc29ja2V0Lm9uKCdjb25uZWN0JywgZG9SZWNvbm5lY3QpOwogIGlmIChzb2NrZXQuY29ubmVjdGVkKSBkb1JlY29ubmVjdCgpOwp9CgovKiAtLS0tLS0tLS0tIOS6i+S7tiAtLS0tLS0tLS0tICovCnNvY2tldC5vbignY3JlYXRlZCcsICh7IGNvZGUgfSkgPT4gewogIGhpZGVPdmVybGF5KCk7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvYmJ5JykuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3dhaXRpbmcnKS5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTsKICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncm9vbUNvZGUnKS50ZXh0Q29udGVudCA9IGNvZGU7Cn0pOwpzb2NrZXQub24oJ2pvaW5lZCcsICgpID0+IHsKICBoaWRlT3ZlcmxheSgpOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2JieScpLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd3YWl0aW5nJykuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dhbWUnKS5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTsKfSk7CnNvY2tldC5vbigncmVjb25uZWN0ZWQnLCAoKSA9PiB7IGhpZGVPdmVybGF5KCk7IH0pOwoKc29ja2V0Lm9uKCdlcnJvck1zZycsICh0KSA9PiB7CiAgY2xlYXJTZXNzaW9uKCk7CiAgaGlkZU92ZXJsYXkoKTsKICBjb25zdCBlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2JieU1zZycpOwogIGlmIChlbCAmJiAhZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvYmJ5JykuY2xhc3NMaXN0LmNvbnRhaW5zKCdoaWRkZW4nKSkgZWwudGV4dENvbnRlbnQgPSB0OwogIGVsc2UgYWxlcnQodCk7Cn0pOwoKLyog562J5b6F6aG177ya5Y+M5pa55Yiw6b2Q5ZCO77yM5Yib5bu66ICF5Ye6546wIuW8gOWniyLmjInpkq4gKi8Kc29ja2V0Lm9uKCdzdGF0ZScsIChzKSA9PiB7CiAgY3VycmVudFN0YXRlID0gczsKICBzYXZlU2Vzc2lvbihzKTsKICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ0NvZGUnKS50ZXh0Q29udGVudCA9IHMuY29kZTsKCiAgaWYgKCFzLnN0YXJ0ZWQpIHsKICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2JieScpLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpOwogICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3dhaXRpbmcnKS5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTsKICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnYW1lJykuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7CiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnb3ZlcicpLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpOwogICAgY29uc3QgYm94ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3dhaXRQbGF5ZXJzJyk7CiAgICBib3guaW5uZXJIVE1MID0gcy5wbGF5ZXJzLm1hcCgocCkgPT4KICAgICAgYDxkaXYgc3R5bGU9ImJhY2tncm91bmQ6JHtwLmNvbm5lY3RlZCA/ICcjZmZmMGY0JyA6ICcjZWVlJ307Ym9yZGVyLXJhZGl1czoxMHB4O3BhZGRpbmc6OHB4IDE0cHg7Zm9udC13ZWlnaHQ6NjAwO2NvbG9yOiR7cC5jb25uZWN0ZWQgPyAnI2ZmNWU3ZScgOiAnIzk5OSd9Ij4ke3AubmFtZX0ke3AuY29ubmVjdGVkID8gJycgOiAnKOaOiee6vyknfTwvZGl2PmAKICAgICkuam9pbignJyk7CiAgICBjb25zdCBtZSA9IHMucGxheWVycy5maW5kKChwKSA9PiBwLmlzWW91KTsKICAgIGlmIChzLnBsYXllcnMubGVuZ3RoID09PSAyICYmIG1lKSB7CiAgICAgIGJveC5pbm5lckhUTUwgKz0gYDxkaXYgc3R5bGU9Im1hcmdpbi10b3A6MTRweDt3aWR0aDoxMDAlIj48YnV0dG9uIGNsYXNzPSJwcmltYXJ5IGJpZyIgaWQ9InN0YXJ0QnRuIj7lvIDlp4vmuLjmiI8g4pa2PC9idXR0b24+PC9kaXY+YDsKICAgICAgY29uc3Qgc2IgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RhcnRCdG4nKTsKICAgICAgaWYgKHNiKSBzYi5vbmNsaWNrID0gKCkgPT4gc29ja2V0LmVtaXQoJ3N0YXJ0R2FtZScpOwogICAgfQogICAgcmV0dXJuOwogIH0KCiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3dhaXRpbmcnKS5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTsKICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2FtZScpLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpOwogIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdvdmVyJykuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7CiAgcmVuZGVyR2FtZShzKTsKfSk7CgovKiAtLS0tLS0tLS0tIOa4uOaIj+a4suafkyAtLS0tLS0tLS0tICovCmZ1bmN0aW9uIHJlbmRlckdhbWUocykgewogIHMucGxheWVycy5mb3JFYWNoKChwLCBpKSA9PiB7CiAgICBjb25zdCBlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdwJyArIGkpOwogICAgaWYgKCFlbCkgcmV0dXJuOwogICAgY29uc3QgaXNUdXJuID0gcy5nYW1lICYmIHMuZ2FtZS5jdXJyZW50ID09PSBpICYmIHMuZ2FtZS5waGFzZSAhPT0gJ2VuZGVkJzsKICAgIGVsLmNsYXNzTmFtZSA9ICdwYm94JyArIChpc1R1cm4gPyAnIGFjdGl2ZScgOiAnJykgKyAocC5iYW5rcnVwdCA/ICcgYnJva2UnIDogJycpOwogICAgY29uc3QgcHJvcENvdW50ID0gT2JqZWN0LmtleXMocC5wcm9wcykubGVuZ3RoOwogICAgY29uc3QgbHZTdW0gPSBPYmplY3QudmFsdWVzKHAucHJvcHMpLnJlZHVjZSgoYSwgYikgPT4gYSArIGIsIDApOwogICAgY29uc3QgbGFwVHh0ID0gcy5nYW1lLm1vZGUgPT09ICdyYWNlJyA/IGAgwrcgJHtwLmxhcHN9LyR7cy5nYW1lLnRhcmdldExhcHN95ZyIYCA6ICcnOwogICAgZWwuaW5uZXJIVE1MID0gYAogICAgICA8ZGl2IGNsYXNzPSJwbmFtZSI+PHNwYW4gY2xhc3M9ImRvdCIgc3R5bGU9ImJhY2tncm91bmQ6JHtwLmNvbG9yfSI+PC9zcGFuPiR7cC5uYW1lfSR7cC5pc1lvdSA/ICcgKOS9oCknIDogJyd9JHtwLmNvbm5lY3RlZCA/ICcnIDogJyDwn5SMJ308L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0icG1vbmV5Ij7wn5KwICR7cC5tb25leX08L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0icGluZm8iPvCfj6AgJHtwcm9wQ291bnR9IOWkhCDCtyDlh4DotYTkuqcgJHtwLm5ldH0ke2xhcFR4dH0ke3AuaW5KYWlsID8gJyDCtyDwn5SS55uR54uxJyA6ICcnfTwvZGl2PmA7CiAgfSk7CgogIGlmIChzLmdhbWUpIHsKICAgIGNvbnN0IGN1ciA9IHMucGxheWVyc1tzLmdhbWUuY3VycmVudF07CiAgICBjb25zdCB0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3R1cm5JbmZvJyk7CiAgICBjb25zdCBtb2RlVGFnID0gYFske3MuZ2FtZS5tb2RlTmFtZX1dIGA7CiAgICBpZiAocy5nYW1lLnBoYXNlID09PSAnZW5kZWQnKSB0LnRleHRDb250ZW50ID0gbW9kZVRhZyArICfmuLjmiI/nu5PmnZ8nOwogICAgZWxzZSB7CiAgICAgIGxldCBwcm9nID0gJyc7CiAgICAgIGlmIChzLmdhbWUubW9kZSA9PT0gJ3JhY2UnKSBwcm9nID0gYOWciOaVsCAke3MucGxheWVycy5tYXAocD0+cC5sYXBzKS5qb2luKCc6Jyl9IGA7CiAgICAgIGVsc2UgaWYgKHMuZ2FtZS5tb2RlID09PSAnY29vcCcpIHByb2cgPSBg5ZCI6K6h5YeA6LWE5LqnICR7cy5wbGF5ZXJzLnJlZHVjZSgoYSxwKT0+YStwLm5ldCwwKX0vJHtzLmdhbWUuY29vcFRhcmdldH0gYDsKICAgICAgZWxzZSBpZiAocy5nYW1lLm1heFJvdW5kcyA+IDApIHByb2cgPSBg56ysICR7cy5nYW1lLnJvdW5kc30vJHtzLmdhbWUubWF4Um91bmRzfSDlm57lkIggYDsKICAgICAgdC50ZXh0Q29udGVudCA9IG1vZGVUYWcgKyBwcm9nICsgKGN1ciAmJiBjdXIuaXNZb3UgPyAn8J+foiDova7liLDkvaDkuoYnIDogYOKPsyDnrYkgJHtjdXIgPyBjdXIubmFtZSA6ICcnfWApICsKICAgICAgICAocy5nYW1lLmRpY2VbMF0gPyBgICDwn46yJHtzLmdhbWUuZGljZVswXX0rJHtzLmdhbWUuZGljZVsxXX1gIDogJycpOwogICAgfQogIH0KCiAgcmVuZGVyQm9hcmQocyk7CiAgcmVuZGVyQ29udHJvbHMocyk7CiAgcmVuZGVyTWluaUdhbWUocyk7CiAgcmVuZGVyTG9nKHMpOwoKICBpZiAocy5nYW1lICYmIHMuZ2FtZS5waGFzZSA9PT0gJ2VuZGVkJykgewogICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ292ZXInKS5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTsKICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd3aW5UZXh0JykudGV4dENvbnRlbnQgPSB3aW5UZXh0KHMpOwogIH0gZWxzZSB7CiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnb3ZlcicpLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpOwogIH0KfQoKZnVuY3Rpb24gd2luVGV4dChzKSB7CiAgaWYgKHMuZ2FtZS5jb29wID09PSB0cnVlKSByZXR1cm4gJ/Cfjokg5ZCI5L2c5oiQ5Yqf77yBJzsKICBpZiAocy5nYW1lLmNvb3AgPT09IGZhbHNlKSByZXR1cm4gJ/CfkpQg5ZCI5L2c5aSx6LSlJzsKICBjb25zdCB3ID0gcy5wbGF5ZXJzLmZpbmQoKHApID0+IHAuaWQgPT09IHMuZ2FtZS53aW5uZXIpOwogIGlmIChzLmdhbWUubW9kZSA9PT0gJ3JhY2UnKSByZXR1cm4gdyA/IGDwn4+BICR7dy5uYW1lfSDnq57pgJ/ojrfog5zvvIFgIDogJ+a4uOaIj+e7k+adnyc7CiAgcmV0dXJuIHcgPyBg8J+OiSAke3cubmFtZX0g6I636IOc77yBYCA6ICfmuLjmiI/nu5PmnZ8nOwp9CgpmdW5jdGlvbiByZW5kZXJCb2FyZChzKSB7CiAgY29uc3QgYm9hcmQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYm9hcmQnKTsKICBjb25zdCB0aWxlcyA9IHMuZ2FtZS50aWxlczsKICBib2FyZC5pbm5lckhUTUwgPSAnJzsKICB0aWxlcy5mb3JFYWNoKCh0aWxlLCBpZHgpID0+IHsKICAgIGNvbnN0IG93bmVyID0gcy5wbGF5ZXJzLmZpbmQoKHApID0+IHAucHJvcHNbaWR4XSAhPT0gdW5kZWZpbmVkKTsKICAgIGNvbnN0IGx2ID0gb3duZXIgPyBvd25lci5wcm9wc1tpZHhdIDogLTE7CiAgICBjb25zdCB0b2tlbnMgPSBzLnBsYXllcnMKICAgICAgLmZpbHRlcigocCkgPT4gcC5wb3MgPT09IGlkeCkKICAgICAgLm1hcCgocCkgPT4gYDxzcGFuIHN0eWxlPSJjb2xvcjoke3AuY29sb3J9Ij4ke3AuaXNZb3UgPyAn8J+foicgOiAn8J+UtSd9PC9zcGFuPmApCiAgICAgIC5qb2luKCcnKTsKICAgIGNvbnN0IGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpOwogICAgZGl2LmNsYXNzTmFtZSA9ICd0aWxlICcgKyB0aWxlLnR5cGU7CiAgICBkaXYuaW5uZXJIVE1MID0gYAogICAgICA8ZGl2IGNsYXNzPSJ0bmFtZSI+JHt0aWxlLm5hbWV9PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9InR0eXBlIj4ke3R5cGVMYWJlbCh0aWxlKX08L2Rpdj4KICAgICAgJHtsdiA+PSAwID8gYDxkaXYgY2xhc3M9Imx2Ij5MdiR7bHZ9PC9kaXY+YCA6ICcnfQogICAgICAke293bmVyID8gYDxkaXYgY2xhc3M9Im93bmVyLWJhciIgc3R5bGU9ImJhY2tncm91bmQ6JHtvd25lci5jb2xvcn0iPjwvZGl2PmAgOiAnJ30KICAgICAgPGRpdiBjbGFzcz0idG9rZW5zIj4ke3Rva2Vuc308L2Rpdj5gOwogICAgYm9hcmQuYXBwZW5kQ2hpbGQoZGl2KTsKICB9KTsKfQoKZnVuY3Rpb24gdHlwZUxhYmVsKHRpbGUpIHsKICBzd2l0Y2ggKHRpbGUudHlwZSkgewogICAgY2FzZSAnZ28nOiByZXR1cm4gJ+i1t+eCuSc7CiAgICBjYXNlICdwcm9wZXJ0eSc6IHJldHVybiAn8J+SsCcgKyB0aWxlLnByaWNlOwogICAgY2FzZSAnY2hhbmNlJzogcmV0dXJuICfinZPmnLrkvJonOwogICAgY2FzZSAnZGVzdGlueSc6IHJldHVybiAn4q2Q5ZG96L+QJzsKICAgIGNhc2UgJ2phaWwnOiByZXR1cm4gJ/CflJLmjqLnm5EnOwogICAgY2FzZSAnZ290b2phaWwnOiByZXR1cm4gJ/CfmpTov5vni7EnOwogICAgY2FzZSAndGF4JzogcmV0dXJuICfwn6e+JyArIHRpbGUuYW1vdW50OwogICAgY2FzZSAncGFyayc6IHJldHVybiAn8J+Mv+WBnOi9pic7CiAgICBjYXNlICdtaW5pZ2FtZSc6IHJldHVybiB0aWxlLmtpbmQgPT09ICdycHMnID8gJ/Cfjq7mi7MnIDogJ/Cfp6DnrZQnOwogICAgZGVmYXVsdDogcmV0dXJuICcnOwogIH0KfQoKZnVuY3Rpb24gcmVuZGVyQ29udHJvbHMocykgewogIGNvbnN0IGcgPSBzLmdhbWU7CiAgY29uc3QgY3VyID0gcy5wbGF5ZXJzW2cuY3VycmVudF07CiAgY29uc3QgbXlUdXJuID0gY3VyICYmIGN1ci5pc1lvdTsKICBjb25zdCByb2xsQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3JvbGxCdG4nKTsKICBjb25zdCBidXlCb3ggPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnV5Qm94Jyk7CiAgY29uc3QgamFpbEJveCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdqYWlsQm94Jyk7CiAgY29uc3QgZXZlbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZXZlbnQnKTsKCiAgaWYgKGcubGFzdEV2ZW50KSB7IGV2ZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpOyBldmVudC50ZXh0Q29udGVudCA9IGcubGFzdEV2ZW50LnRleHQ7IH0KICBlbHNlIGV2ZW50LmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpOwoKICByb2xsQnRuLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpOwogIGJ1eUJveC5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTsKICBqYWlsQm94LmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpOwoKICBpZiAoZy5waGFzZSA9PT0gJ2VuZGVkJykgcmV0dXJuOwogIGlmIChteVR1cm4pIHsKICAgIGlmIChnLnBoYXNlID09PSAnYXdhaXRfcm9sbCcpIHsKICAgICAgcm9sbEJ0bi5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTsKICAgICAgaWYgKGN1ci5pbkphaWwpIGphaWxCb3guY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7CiAgICB9IGVsc2UgaWYgKGcucGhhc2UgPT09ICdhd2FpdF9idXknKSB7CiAgICAgIGJ1eUJveC5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTsKICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2J1eVByaWNlJykudGV4dENvbnRlbnQgPSBnLmxhc3RFdmVudC5wcmljZTsKICAgIH0KICB9Cn0KCmZ1bmN0aW9uIHJlbmRlck1pbmlHYW1lKHMpIHsKICBjb25zdCBnID0gcy5nYW1lOwogIGNvbnN0IG1nID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21pbmlHYW1lJyk7CiAgY29uc3QgcnBzQm94ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Jwc0JveCcpOwogIGNvbnN0IHF1aXpCb3ggPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncXVpekJveCcpOwogIG1nLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpOyBycHNCb3guY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7IHF1aXpCb3guY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7CiAgaWYgKCFnKSByZXR1cm47CgogIGlmIChnLnBoYXNlID09PSAnYXdhaXRfcnBzJyAmJiBnLnJwcykgewogICAgbWcuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7IHJwc0JveC5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTsKICAgIGNvbnN0IHIgPSBnLnJwczsKICAgIGNvbnN0IHN0YXR1cyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdycHNTdGF0dXMnKTsKICAgIGNvbnN0IHJlcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdycHNSZXN1bHQnKTsKICAgIGlmIChyLnJlc29sdmVkKSB7CiAgICAgIHJlcy50ZXh0Q29udGVudCA9IHIucmVzdWx0LnRleHQ7IHN0YXR1cy50ZXh0Q29udGVudCA9ICcnOwogICAgfSBlbHNlIGlmIChyLm1pbmUpIHsKICAgICAgc3RhdHVzLnRleHRDb250ZW50ID0gYOS9oOW3suWHuiAke2xhYmVsUihyLm1pbmUpfe+8jOetieW+hSAke3Iub3Bwb25lbnROYW1lfeKApmA7CiAgICAgIHJlcy50ZXh0Q29udGVudCA9ICcnOwogICAgfSBlbHNlIHsKICAgICAgc3RhdHVzLnRleHRDb250ZW50ID0gYOivt+WHuuaLs++8iOWvueaWuSR7ci5vdGhlclBpY2tlZCA/ICflt7Llh7onIDogJ+aAneiAg+S4rSd977yJYDsKICAgICAgcmVzLnRleHRDb250ZW50ID0gJyc7CiAgICB9CiAgfSBlbHNlIGlmIChnLnBoYXNlID09PSAnYXdhaXRfcXVpeicgJiYgZy5xdWl6KSB7CiAgICBtZy5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTsgcXVpekJveC5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTsKICAgIGNvbnN0IHEgPSBnLnF1aXo7CiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncXVpelEnKS50ZXh0Q29udGVudCA9IHEucTsKICAgIGNvbnN0IG9wdHMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncXVpek9wdHMnKTsKICAgIGNvbnN0IHJlc3VsdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdxdWl6UmVzdWx0Jyk7CiAgICBpZiAocS5hbnN3ZXJlZCkgewogICAgICBvcHRzLmlubmVySFRNTCA9ICcnOwogICAgICByZXN1bHQudGV4dENvbnRlbnQgPSAocS5jb3JyZWN0ICE9PSBudWxsICYmIHEuY29ycmVjdCAhPT0gdW5kZWZpbmVkKQogICAgICAgID8gYOato+ehruetlOahiO+8miR7cS5vcHRpb25zW3EuY29ycmVjdF19YCA6ICcnOwogICAgfSBlbHNlIGlmIChxLmlzQW5zd2VyZXIpIHsKICAgICAgcmVzdWx0LnRleHRDb250ZW50ID0gJ+i9ruWIsOS9oOS9nOetlO+8mic7CiAgICAgIG9wdHMuaW5uZXJIVE1MID0gcS5vcHRpb25zLm1hcCgobywgaSkgPT4KICAgICAgICBgPGJ1dHRvbiBjbGFzcz0icXVpei1vcHQiIGRhdGEtaT0iJHtpfSI+JHtvfTwvYnV0dG9uPmApLmpvaW4oJycpOwogICAgICBvcHRzLnF1ZXJ5U2VsZWN0b3JBbGwoJy5xdWl6LW9wdCcpLmZvckVhY2goKGIpID0+IHsKICAgICAgICBiLm9uY2xpY2sgPSAoKSA9PiBzb2NrZXQuZW1pdCgncXVpekFuc3dlcicsIHsgaWR4OiArYi5kYXRhc2V0LmkgfSk7CiAgICAgIH0pOwogICAgfSBlbHNlIHsKICAgICAgb3B0cy5pbm5lckhUTUwgPSBxLm9wdGlvbnMubWFwKChvKSA9PiBgPGRpdiBzdHlsZT0icGFkZGluZzo4cHggMTBweDtiYWNrZ3JvdW5kOiNmMWYyZjg7Ym9yZGVyLXJhZGl1czoxMHB4Ij4ke299PC9kaXY+YCkuam9pbignJyk7CiAgICAgIHJlc3VsdC50ZXh0Q29udGVudCA9IGDnrYnlvoUgJHtxLmFuc3dlcmVyTmFtZX0g5L2c562U4oCmYDsKICAgIH0KICB9Cn0KZnVuY3Rpb24gbGFiZWxSKGMpIHsgcmV0dXJuIGMgPT09ICdyb2NrJyA/ICfinIrnn7PlpLQnIDogYyA9PT0gJ3BhcGVyJyA/ICfinIvluIMnIDogJ+KcjO+4j+WJquWIgCc7IH0KCmZ1bmN0aW9uIHJlbmRlckxvZyhzKSB7CiAgY29uc3QgbG9nID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvZycpOwogIGxvZy5pbm5lckhUTUwgPSAocy5nYW1lLmxvZyB8fCBbXSkubWFwKChsKSA9PiBgPGRpdj4ke2wubXNnfTwvZGl2PmApLmpvaW4oJycpOwp9CgovKiAtLS0tLS0tLS0tIOaTjeS9nCAtLS0tLS0tLS0tICovCmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyb2xsQnRuJykub25jbGljayA9ICgpID0+IHNvY2tldC5lbWl0KCdyb2xsRGljZScpOwpkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnV5WWVzJykub25jbGljayA9ICgpID0+IHNvY2tldC5lbWl0KCdidXlEZWNpc2lvbicsIHsgYnV5OiB0cnVlIH0pOwpkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnV5Tm8nKS5vbmNsaWNrID0gKCkgPT4gc29ja2V0LmVtaXQoJ2J1eURlY2lzaW9uJywgeyBidXk6IGZhbHNlIH0pOwpkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnamFpbFBheScpLm9uY2xpY2sgPSAoKSA9PiBzb2NrZXQuZW1pdCgnamFpbEFjdGlvbicsIHsgcGF5OiB0cnVlIH0pOwpkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnamFpbFdhaXQnKS5vbmNsaWNrID0gKCkgPT4gc29ja2V0LmVtaXQoJ2phaWxBY3Rpb24nLCB7IHBheTogZmFsc2UgfSk7CmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhZ2FpbkJ0bicpLm9uY2xpY2sgPSAoKSA9PiB7IGNsZWFyU2Vzc2lvbigpOyBzb2NrZXQuZW1pdCgncmVzdGFydCcpOyB9Owpkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcucnBzLWJ0bicpLmZvckVhY2goKGIpID0+IHsKICBiLm9uY2xpY2sgPSAoKSA9PiBzb2NrZXQuZW1pdCgncnBzUGljaycsIHsgY2hvaWNlOiBiLmRhdGFzZXQucnBzIH0pOwp9KTsKCi8qIOiBiuWkqSAqLwpkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY2hhdFNlbmQnKS5vbmNsaWNrID0gc2VuZENoYXQ7CmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjaGF0SW5wdXQnKS5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGUpID0+IHsgaWYgKGUua2V5ID09PSAnRW50ZXInKSBzZW5kQ2hhdCgpOyB9KTsKZnVuY3Rpb24gc2VuZENoYXQoKSB7CiAgY29uc3QgdiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjaGF0SW5wdXQnKS52YWx1ZS50cmltKCk7CiAgaWYgKCF2KSByZXR1cm47CiAgc29ja2V0LmVtaXQoJ2NoYXQnLCB7IHRleHQ6IHYgfSk7CiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NoYXRJbnB1dCcpLnZhbHVlID0gJyc7Cn0Kc29ja2V0Lm9uKCdjaGF0JywgKHsgbmFtZSwgdGV4dCwgY29sb3IgfSkgPT4gewogIGNvbnN0IGJveCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjaGF0TG9nJyk7CiAgY29uc3QgZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpOwogIGQuaW5uZXJIVE1MID0gYDxiIHN0eWxlPSJjb2xvcjoke2NvbG9yfSI+JHtuYW1lfTwvYj46ICR7dGV4dH1gOwogIGJveC5hcHBlbmRDaGlsZChkKTsKICBib3guc2Nyb2xsVG9wID0gYm94LnNjcm9sbEhlaWdodDsKfSk7Cgo8L3NjcmlwdD4KPC9ib2R5Pgo8L2h0bWw+Cg==', 'base64').toString('utf8');
app.get('/', (req, res) => res.type('text/html').send(PAGE_HTML));

const PORT = process.env.PORT || 3000;
const SAVE_DIR = path.join(__dirname, 'saves');
if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR);

/* =========================================================
 *  模式配置
 * ======================================================= */
const MODES = {
  classic: { name: '经典对战', maxRounds: 30, targetLaps: 0, coopTarget: 0,
             desc: '谁先破产，或30圈后净资产多者胜' },
  race:    { name: '竞速模式', maxRounds: 0, targetLaps: 3, coopTarget: 0,
             desc: '最先绕棋盘3圈者获胜' },
  coop:    { name: '合作通关', maxRounds: 40, targetLaps: 0, coopTarget: 6000,
             desc: '两人合计净资产达6000即共同获胜，任一方破产则失败' },
};

/* =========================================================
 *  地图主题（可插拔：加新主题照着加一份数据即可）
 *  tile.type: go/property/chance/destiny/jail/gotojail/tax/park/minigame
 *  minigame.kind: rps(石头剪刀布) / quiz(答题)
 * ======================================================= */
const THEMES = {
  city: {
    name: '城市冒险', salary: 200, startMoney: 1500, upgradeRate: 0.5,
    tiles: [
      { type: 'go',       name: '起点' },
      { type: 'property', name: '中央车站', price: 200 },
      { type: 'chance',   name: '机会' },
      { type: 'property', name: '商业街',   price: 180 },
      { type: 'property', name: '美食街',   price: 160 },
      { type: 'jail',     name: '监狱(探监)' },
      { type: 'property', name: '科技园',   price: 220 },
      { type: 'minigame', name: '🧠 答题挑战', kind: 'quiz' },
      { type: 'property', name: '金融街',   price: 240 },
      { type: 'property', name: '电影院',   price: 200 },
      { type: 'gotojail', name: '进监狱' },
      { type: 'property', name: '大学城',   price: 260 },
      { type: 'chance',   name: '机会' },
      { type: 'property', name: '海滨',     price: 280 },
      { type: 'tax',      name: '所得税', amount: 100 },
      { type: 'property', name: '古城区',   price: 300 },
      { type: 'minigame', name: '🎮 石头剪刀布', kind: 'rps' },
      { type: 'property', name: '机场',     price: 320 },
      { type: 'park',     name: '免费停车' },
      { type: 'property', name: '市中心',   price: 350 },
    ],
  },
  campus: {
    name: '校园时光', salary: 200, startMoney: 1500, upgradeRate: 0.5,
    tiles: [
      { type: 'go',       name: '开学' },
      { type: 'property', name: '图书馆',   price: 120 },
      { type: 'chance',   name: '社团活动' },
      { type: 'property', name: '食堂',     price: 100 },
      { type: 'property', name: '操场',     price: 90 },
      { type: 'jail',     name: '教导处(探监)' },
      { type: 'property', name: '自习室',   price: 130 },
      { type: 'minigame', name: '🧠 答题挑战', kind: 'quiz' },
      { type: 'property', name: '实验室',   price: 140 },
      { type: 'property', name: '宿舍楼',   price: 120 },
      { type: 'gotojail', name: '校长室' },
      { type: 'property', name: '体育馆',   price: 150 },
      { type: 'minigame', name: '🎮 石头剪刀布', kind: 'rps' },
      { type: 'property', name: '咖啡厅',   price: 140 },
      { type: 'tax',      name: '班费', amount: 80 },
      { type: 'property', name: '创业园',   price: 160 },
      { type: 'destiny',  name: '奖学金' },
      { type: 'property', name: '校医院',   price: 150 },
      { type: 'park',     name: '大草坪' },
      { type: 'property', name: '校门口',   price: 180 },
    ],
  },
};

/* 卡片池 */
const CARD_POOLS = {
  chance: [
    { text: '路上捡到钱，+150', effect: { type: 'money', amount: 150 } },
    { text: '报销一笔开销，+100', effect: { type: 'money', amount: 100 } },
    { text: '发工资啦，+200', effect: { type: 'money', amount: 200 } },
    { text: '请客吃饭，-120', effect: { type: 'money', amount: -120 } },
    { text: '修车花了钱，-80', effect: { type: 'money', amount: -80 } },
    { text: '交罚款，-100', effect: { type: 'money', amount: -100 } },
    { text: '被好运眷顾，回到起点领工资', effect: { type: 'goto', pos: 0 } },
    { text: '调皮被抓，直接进监狱', effect: { type: 'jail' } },
  ],
  destiny: [
    { text: '投资获利，+180', effect: { type: 'money', amount: 180 } },
    { text: '中彩票了，+220', effect: { type: 'money', amount: 220 } },
    { text: '意外支出，-150', effect: { type: 'money', amount: -150 } },
    { text: '请朋友帮忙，-90', effect: { type: 'money', amount: -90 } },
    { text: '命运转盘，回到起点领工资', effect: { type: 'goto', pos: 0 } },
    { text: '人生低谷，直接进监狱', effect: { type: 'jail' } },
  ],
};

/* 答题题库（轻松向，适合情侣） */
const QUIZ_POOL = [
  { q: '蜜蜂采集什么来酿蜜？', options: ['花蜜', '树叶', '雨水', '泥土'], a: 0 },
  { q: '一年中有几个月有31天？', options: ['6个', '7个', '8个', '5个'], a: 1 },
  { q: '“情人节”是每年的哪一天？', options: ['2月14日', '3月14日', '2月7日', '7月7日'], a: 0 },
  { q: '彩虹通常有几种颜色？', options: ['5种', '6种', '7种', '8种'], a: 2 },
  { q: '下面哪个不是编程语言？', options: ['Python', 'Java', 'HTML', 'Photoshop'], a: 3 },
  { q: '地球上最大的洋是？', options: ['大西洋', '印度洋', '太平洋', '北冰洋'], a: 2 },
  { q: '“♥”在扑克牌里代表什么花色？', options: ['黑桃', '红桃', '梅花', '方块'], a: 1 },
  { q: '一天有多少个小时？', options: ['12', '24', '36', '48'], a: 1 },
  { q: '猫通常有几条腿？', options: ['2', '4', '6', '8'], a: 1 },
  { q: '“元旦”是几月几日？', options: ['1月1日', '1月15日', '2月1日', '12月31日'], a: 0 },
];

const RPS_PRIZE = 60;   // 石头剪刀布胜者赢得金额
const QUIZ_REWARD = 80; // 答对奖励
const QUIZ_PENALTY = 40;// 答错扣款

/* =========================================================
 *  房间管理
 * ======================================================= */
const rooms = new Map();
const tokens = new Map(); // token -> {code, playerId}

function genCode() {
  let code;
  do { code = Math.random().toString(36).slice(2, 8).toUpperCase(); }
  while (rooms.has(code) || fs.existsSync(path.join(SAVE_DIR, code + '.json')));
  return code;
}
function genToken() {
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}
function drawCard(pool) {
  const arr = CARD_POOLS[pool];
  return arr[Math.floor(Math.random() * arr.length)];
}
function rentOf(theme, tile, level) {
  return Math.round(tile.price * (level + 1) * 0.5);
}
function netWorth(room, p) {
  let n = p.money;
  for (const idx in p.props) {
    const tile = THEMES[room.theme].tiles[idx];
    n += tile.price + Math.round(tile.price * room.game.upgradeRate * p.props[idx]);
  }
  return n;
}
function makePlayer(id, name, color, token) {
  return {
    id, name: name || '玩家', color, token, connected: true,
    pos: 0, money: 0, props: {}, cards: 0, inJail: false,
    jailTurns: 0, bankrupt: false, laps: 0,
  };
}

function buildGame(room) {
  const theme = THEMES[room.theme];
  const m = MODES[room.mode];
  room.game = {
    theme: room.theme, mode: room.mode, modeName: m.name,
    tiles: theme.tiles, salary: theme.salary, startMoney: theme.startMoney,
    upgradeRate: theme.upgradeRate,
    current: 0, maxRounds: m.maxRounds, rounds: 0,
    targetLaps: m.targetLaps, coopTarget: m.coopTarget,
    phase: 'await_roll', dice: [0, 0], doublesCount: 0,
    rps: null, quiz: null,
    lastEvent: null, log: [], winner: null, coop: null,
  };
  room.players.forEach((p) => {
    p.pos = 0; p.money = theme.startMoney; p.props = {}; p.cards = 0;
    p.inJail = false; p.jailTurns = 0; p.bankrupt = false; p.laps = 0;
  });
  pushLog(room, `游戏开始！地图：${theme.name} · 模式：${m.name}（${m.desc}）`);
  pushLog(room, `每人初始资金 ${theme.startMoney}。`);
}

function pushLog(room, msg) {
  if (!room.game) return;
  room.game.log.unshift({ t: Date.now(), msg });
  if (room.game.log.length > 50) room.game.log.pop();
}

function publicState(room, forId) {
  return {
    code: room.code, theme: room.theme, themeName: THEMES[room.theme].name,
    mode: room.mode, modeName: room.game ? room.game.modeName : MODES[room.mode].name,
    players: room.players.map((p) => {
      const viewer = p.id === forId;
      const base = {
        id: p.id, name: p.name, color: p.color, pos: p.pos, money: p.money,
        props: p.props, inJail: p.inJail, jailTurns: p.jailTurns,
        bankrupt: p.bankrupt, laps: p.laps, net: room.game ? netWorth(room, p) : p.money,
        connected: p.connected, isYou: viewer,
      };
      if (viewer) base.token = p.token; // 仅向本人下发 token，用于重连
      return base;
    }),
    started: !!room.game,
    game: room.game ? {
      tiles: room.game.tiles, current: room.game.current, phase: room.game.phase,
      dice: room.game.dice, lastEvent: room.game.lastEvent, log: room.game.log,
      winner: room.game.winner, coop: room.game.coop, salary: room.game.salary,
      rounds: room.game.rounds, maxRounds: room.game.maxRounds,
      targetLaps: room.game.targetLaps, coopTarget: room.game.coopTarget,
      rps: room.game.rps ? rpsView(room, forId) : null,
      quiz: room.game.quiz ? quizView(room, forId) : null,
    } : null,
  };
}

function rpsView(room, forId) {
  const r = room.game.rps;
  const me = room.players.find((p) => p.id === forId);
  const other = room.players.find((p) => p.id !== forId);
  const mine = r.picks[forId] || null;
  const otherPicked = !!(other && r.picks[other.id]);
  return {
    tile: r.tile, mine, otherPicked, resolved: r.resolved,
    result: r.resolved ? r.result : null,
    opponentName: other ? other.name : '',
  };
}
function quizView(room, forId) {
  const q = room.game.quiz;
  const answerer = room.players.find((p) => p.id === q.answerer);
  return {
    tile: q.tile, q: q.q, options: q.options,
    answererName: answerer ? answerer.name : '',
    isAnswerer: answerer ? answerer.id === forId : false,
    answered: q.answered,
    correct: q.answered ? q.a : null,
  };
}

function broadcast(room) {
  room.players.forEach((p) => {
    if (p.id) io.to(p.id).emit('state', publicState(room, p.id));
  });
  persistRoom(room);
}
function step(room) {
  checkEnd(room);
  broadcast(room);
}

/* =========================================================
 *  游戏动作
 * ======================================================= */
function advanceTurn(room, samePlayer) {
  const g = room.game;
  if (!samePlayer) {
    g.current = (g.current + 1) % room.players.length;
    g.doublesCount = 0;
    if (g.current === 0 && g.maxRounds > 0) {
      g.rounds = (g.rounds || 0) + 1;
      if (g.rounds >= g.maxRounds) { endByRounds(room); return; }
    }
  }
  g.phase = 'await_roll';
  let guard = 0;
  while (room.players[g.current].bankrupt && guard < room.players.length) {
    g.current = (g.current + 1) % room.players.length;
    guard++;
  }
}

function rollDice(room, player) {
  const g = room.game;
  const d1 = 1 + Math.floor(Math.random() * 6);
  const d2 = 1 + Math.floor(Math.random() * 6);
  g.dice = [d1, d2];
  const isDouble = d1 === d2;

  if (player.inJail) {
    if (isDouble) {
      player.inJail = false; player.jailTurns = 0;
      pushLog(room, `${player.name} 掷出双数(${d1},${d2})，成功出狱！`);
    } else {
      player.jailTurns++;
      pushLog(room, `${player.name} 在监狱掷出 ${d1},${d2}，继续关押(${player.jailTurns}/3)。`);
      if (player.jailTurns >= 3) {
        player.inJail = false; player.jailTurns = 0; player.money -= 50;
        pushLog(room, `${player.name} 关满3回合，交保释金50出狱。`);
        g.lastEvent = { type: 'info', text: `${player.name} 交保释金50出狱` };
      } else {
        g.lastEvent = { type: 'info', text: `${player.name} 仍在监狱` };
        advanceTurn(room, false);
      }
      return;
    }
  }

  const steps = d1 + d2;
  const oldPos = player.pos;
  player.pos = (player.pos + steps) % g.tiles.length;
  if (player.pos < oldPos) {
    player.laps++;
    player.money += g.salary;
    pushLog(room, `${player.name} 绕完第 ${player.laps} 圈，经过起点领工资 +${g.salary}。`);
  }
  pushLog(room, `${player.name} 掷出 ${d1}+${d2}=${steps}，移动到【${g.tiles[player.pos].name}】。`);

  resolveTile(room, player);

  if (g.phase === 'await_roll') {
    if (isDouble) {
      g.doublesCount++;
      if (g.doublesCount >= 3) {
        player.inJail = true; player.jailTurns = 0; player.pos = 5;
        pushLog(room, `${player.name} 连续三次双数，被送进监狱！`);
        g.lastEvent = { type: 'info', text: '三次双数 → 进监狱' };
        advanceTurn(room, false);
      } // 否则同一玩家再来（phase 保持 await_roll）
    } else {
      advanceTurn(room, false);
    }
  }
}

function resolveTile(room, player) {
  const g = room.game;
  const tile = g.tiles[player.pos];

  if (tile.type === 'property') {
    const owner = findOwner(room, player.pos);
    if (owner === null) {
      g.phase = 'await_buy';
      g.lastEvent = { type: 'buy', tile: player.pos, price: tile.price };
      return;
    } else if (owner.id !== player.id) {
      const level = owner.props[player.pos] || 0;
      const rent = rentOf(THEMES[room.theme], tile, level);
      player.money -= rent; owner.money += rent;
      pushLog(room, `${player.name} 踩到 ${owner.name} 的【${tile.name}】，交过路费 ${rent}。`);
      g.lastEvent = { type: 'info', text: `过路费 -${rent}` };
      checkBankrupt(room, player);
    }
  } else if (tile.type === 'chance' || tile.type === 'destiny') {
    const card = drawCard(tile.type);
    applyCard(room, player, card);
    g.lastEvent = { type: 'card', text: card.text };
  } else if (tile.type === 'minigame') {
    if (tile.kind === 'rps') startRPS(room, player);
    else if (tile.kind === 'quiz') startQuiz(room, player);
  } else if (tile.type === 'gotojail') {
    player.inJail = true; player.jailTurns = 0; player.pos = 5;
    pushLog(room, `${player.name} 被送进监狱！`);
    g.lastEvent = { type: 'info', text: '进监狱！' };
  } else if (tile.type === 'tax') {
    player.money -= tile.amount;
    pushLog(room, `${player.name} 缴纳 ${tile.name} -${tile.amount}。`);
    g.lastEvent = { type: 'info', text: `${tile.name} -${tile.amount}` };
    checkBankrupt(room, player);
  } else if (tile.type === 'park') {
    g.lastEvent = { type: 'info', text: '免费停车，休息一下~' };
  } else if (tile.type === 'jail') {
    g.lastEvent = { type: 'info', text: '只是探监，没事~' };
  }
}

function applyCard(room, player, card) {
  const g = room.game;
  const e = card.effect;
  if (e.type === 'money') {
    player.money += e.amount;
    pushLog(room, `${player.name} 抽卡：${card.text}`);
    checkBankrupt(room, player);
  } else if (e.type === 'goto') {
    player.pos = e.pos; player.money += g.salary;
    pushLog(room, `${player.name} 抽卡：${card.text}`);
  } else if (e.type === 'jail') {
    player.inJail = true; player.jailTurns = 0; player.pos = 5;
    pushLog(room, `${player.name} 抽卡：${card.text}`);
  }
}

function startRPS(room, player) {
  const g = room.game;
  g.phase = 'await_rps';
  g.rps = { tile: player.pos, picks: {}, resolved: false, result: null };
  g.lastEvent = { type: 'info', text: `🎮 ${player.name} 触发石头剪刀布！两人各出拳` };
  pushLog(room, `${player.name} 踩中【石头剪刀布】，双方同时出拳，胜者赢 ${RPS_PRIZE}！`);
}
function startQuiz(room, player) {
  const g = room.game;
  const item = QUIZ_POOL[Math.floor(Math.random() * QUIZ_POOL.length)];
  const opts = item.options.map((t, i) => ({ t, i }));
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  const shuffled = opts.map((o) => o.t);
  const correctShuffled = opts.findIndex((o) => o.i === item.a);
  g.phase = 'await_quiz';
  g.quiz = { tile: player.pos, q: item.q, options: shuffled, a: correctShuffled,
             answerer: player.id, answered: false };
  g.lastEvent = { type: 'info', text: `🧠 ${player.name} 触发答题挑战！` };
  pushLog(room, `${player.name} 踩中【答题挑战】，答对 +${QUIZ_REWARD}，答错 -${QUIZ_PENALTY}。`);
}
function resolveRPS(room) {
  const g = room.game;
  const [p0, p1] = room.players;
  const a = g.rps.picks[p0.id], b = g.rps.picks[p1.id];
  const beats = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
  let winner = null;
  if (a === b) {
    g.rps.result = { tie: true, text: `平局！双方都出${labelRPS(a)}，不扣分` };
    pushLog(room, `石头剪刀布平局（都出${labelRPS(a)}）。`);
  } else if (beats[a] === b) {
    winner = p0; g.rps.result = { winner: p0.id, text: `${p0.name} 赢！+${RPS_PRIZE}` };
  } else {
    winner = p1; g.rps.result = { winner: p1.id, text: `${p1.name} 赢！+${RPS_PRIZE}` };
  }
  if (winner) {
    const loser = winner === p0 ? p1 : p0;
    winner.money += RPS_PRIZE; loser.money -= RPS_PRIZE;
    pushLog(room, `石头剪刀布：${winner.name} 胜，赢得 ${RPS_PRIZE}（${labelRPS(a)} vs ${labelRPS(b)}）。`);
    checkBankrupt(room, loser);
  }
  g.rps.resolved = true;
}
function labelRPS(c) { return c === 'rock' ? '✊石头' : c === 'paper' ? '✋布' : '✌️剪刀'; }

function findOwner(room, tileIndex) {
  return room.players.find((p) => p.props[tileIndex] !== undefined) || null;
}
function checkBankrupt(room, player) {
  if (player.money < 0) {
    player.money = 0; player.bankrupt = true;
    pushLog(room, `${player.name} 资金告罄，破产出局！`);
  }
}

/* ===== 胜负判定（按模式） ===== */
function checkEnd(room) {
  const g = room.game;
  if (g.phase === 'ended') return;
  const alive = room.players.filter((p) => !p.bankrupt);

  if (g.mode === 'race') {
    const leader = room.players.find((p) => !p.bankrupt && p.laps >= g.targetLaps);
    if (leader) return endRace(room, leader);
    if (alive.length === 1) return endRace(room, alive[0]);
    return;
  }
  if (g.mode === 'coop') {
    if (alive.length < room.players.length) return endCoop(room, false);
    const combined = alive.reduce((s, p) => s + netWorth(room, p), 0);
    if (combined >= g.coopTarget) return endCoop(room, true);
    return;
  }
  // classic
  if (alive.length === 1) {
    g.phase = 'ended'; g.winner = alive[0].id;
    pushLog(room, `🎉 ${alive[0].name} 获胜！`);
    g.lastEvent = { type: 'win', text: `${alive[0].name} 获胜！` };
  }
}
function endRace(room, winner) {
  const g = room.game;
  g.phase = 'ended'; g.winner = winner.id;
  pushLog(room, `🏁 ${winner.name} 率先跑满 ${g.targetLaps} 圈，赢得竞速！`);
  g.lastEvent = { type: 'win', text: `${winner.name} 竞速获胜！` };
}
function endCoop(room, success) {
  const g = room.game;
  g.phase = 'ended'; g.coop = success;
  if (success) {
    g.winner = room.players[0].id;
    pushLog(room, `🎉 合作成功！两人合计净资产达标，共同获胜！`);
    g.lastEvent = { type: 'win', text: '合作成功，共同获胜！💕' };
  } else {
    g.winner = null;
    pushLog(room, `💔 合作失败，有人破产了……下次加油！`);
    g.lastEvent = { type: 'win', text: '合作失败 💔' };
  }
}
function endByRounds(room) {
  const g = room.game;
  g.phase = 'ended';
  if (g.mode === 'coop') {
    const alive = room.players.filter((p) => !p.bankrupt);
    const combined = alive.reduce((s, p) => s + netWorth(room, p), 0);
    endCoop(room, combined >= g.coopTarget);
    return;
  }
  if (g.mode === 'race') {
    const sorted = [...room.players].sort((a, b) => b.laps - a.laps || netWorth(room, b) - netWorth(room, a));
    endRace(room, sorted[0]);
    return;
  }
  let best = room.players[0];
  room.players.forEach((p) => { if (netWorth(room, p) > netWorth(room, best)) best = p; });
  g.winner = best.id;
  pushLog(room, `🏁 到达 ${g.maxRounds} 回合上限，按净资产结算！`);
  pushLog(room, `🎉 ${best.name} 获胜（净资产 ${netWorth(room, best)}）！`);
  g.lastEvent = { type: 'win', text: `${best.name} 获胜（净资产 ${netWorth(room, best)}）` };
}

function buyProperty(room, player, tileIndex, doBuy) {
  const g = room.game;
  const tile = g.tiles[tileIndex];
  if (doBuy && player.money >= tile.price) {
    player.money -= tile.price; player.props[tileIndex] = 0;
    pushLog(room, `${player.name} 买下【${tile.name}】，花费 ${tile.price}。`);
    g.lastEvent = { type: 'info', text: `买入 ${tile.name}` };
  } else {
    pushLog(room, `${player.name} 放弃了【${tile.name}】。`);
  }
  advanceTurn(room, false);
}
function upgradeProperty(room, player, tileIndex) {
  const g = room.game;
  const tile = g.tiles[tileIndex];
  const level = player.props[tileIndex];
  if (level === undefined || level >= 3) return { ok: false, msg: '无法升级' };
  const cost = Math.round(tile.price * g.upgradeRate);
  if (player.money < cost) return { ok: false, msg: '钱不够' };
  player.money -= cost; player.props[tileIndex] = level + 1;
  pushLog(room, `${player.name} 升级【${tile.name}】到 Lv${level + 1}，花费 ${cost}。`);
  checkBankrupt(room, player);
  return { ok: true };
}

/* 断开时若挂着未完成的小游戏，直接跳过（不结算） */
function skipPendingMinigame(room) {
  const g = room.game;
  if (g.phase === 'await_rps' || g.phase === 'await_quiz') {
    g.rps = null; g.quiz = null;
    pushLog(room, `对方掉线，小游戏取消，继续游戏。`);
    advanceTurn(room, false);
  }
}

/* =========================================================
 *  落盘存档 / 读取
 * ======================================================= */
function persistRoom(room) {
  const data = {
    code: room.code, theme: room.theme, mode: room.mode,
    players: room.players.map((p) => ({
      id: p.id, name: p.name, color: p.color, token: p.token, connected: p.connected,
      pos: p.pos, money: p.money, props: p.props, cards: p.cards, inJail: p.inJail,
      jailTurns: p.jailTurns, bankrupt: p.bankrupt, laps: p.laps,
    })),
    game: room.game || null,
  };
  fs.writeFile(path.join(SAVE_DIR, room.code + '.json'), JSON.stringify(data), () => {});
}
function deleteSave(code) {
  const f = path.join(SAVE_DIR, code + '.json');
  if (fs.existsSync(f)) fs.unlinkSync(f);
}
function loadSaves() {
  const files = fs.readdirSync(SAVE_DIR).filter((f) => f.endsWith('.json'));
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(SAVE_DIR, f), 'utf8'));
      const room = {
        code: data.code, theme: data.theme, mode: data.mode,
        players: data.players.map((p) => ({ ...p, id: null, connected: false })),
        game: data.game,
      };
      rooms.set(room.code, room);
      room.players.forEach((p) => tokens.set(p.token, { code: room.code, playerId: p.id }));
      if (data.game) pushLog(room, '（已从存档恢复，等待玩家重连…）');
    } catch (e) { /* 忽略损坏存档 */ }
  }
  if (files.length) console.log(`📦 已恢复 ${files.length} 个存档房间`);
}

/* =========================================================
 *  Socket 事件
 * ======================================================= */
io.on('connection', (socket) => {
  socket.on('createRoom', ({ name, theme, mode }) => {
    const code = genCode();
    const room = {
      code, theme: THEMES[theme] ? theme : 'city', mode: MODES[mode] ? mode : 'classic',
      players: [makePlayer(socket.id, name, '#ff5e7e', genToken())], game: null,
    };
    rooms.set(code, room);
    tokens.set(room.players[0].token, { code, playerId: socket.id });
    socket.join(code);
    socket.emit('created', { code });
    socket.emit('state', publicState(room, socket.id));
  });

  socket.on('joinRoom', ({ code, name }) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return socket.emit('errorMsg', '房间不存在');
    if (room.players.length >= 2) return socket.emit('errorMsg', '房间已满');
    if (room.game) return socket.emit('errorMsg', '游戏已开始，无法加入');
    const p = makePlayer(socket.id, name, '#3b82f6', genToken());
    room.players.push(p);
    tokens.set(p.token, { code: room.code, playerId: socket.id });
    socket.join(room.code);
    socket.emit('joined', { code: room.code });
    broadcast(room);
  });

  socket.on('reconnect', ({ code, token, name }) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return socket.emit('errorMsg', '房间不存在或已过期');
    const p = room.players.find((x) => x.token === token);
    if (!p) return socket.emit('errorMsg', '身份校验失败，请重新加入');
    p.id = socket.id; p.connected = true;
    if (name && !room.game) p.name = name;
    socket.join(room.code);
    socket.emit('reconnected', { code: room.code });
    broadcast(room);
  });

  socket.on('startGame', () => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.players.length < 2) return;
    if (room.game && room.game.phase === 'ended') room.game = null;
    if (room.game) return;
    buildGame(room);
    broadcast(room);
  });

  socket.on('rollDice', () => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.game) return;
    const g = room.game;
    if (g.phase !== 'await_roll') return;
    const player = room.players[g.current];
    if (player.id !== socket.id) return;
    rollDice(room, player);
    step(room);
  });

  socket.on('buyDecision', ({ buy }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.game) return;
    const g = room.game;
    if (g.phase !== 'await_buy') return;
    const player = room.players[g.current];
    if (player.id !== socket.id) return;
    buyProperty(room, player, g.lastEvent.tile, buy);
    step(room);
  });

  socket.on('upgrade', ({ tileIndex }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.game) return;
    const player = room.players.find((p) => p.id === socket.id);
    const res = upgradeProperty(room, player, tileIndex);
    if (res.ok) step(room);
    else socket.emit('errorMsg', res.msg);
  });

  socket.on('rpsPick', ({ choice }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.game) return;
    const g = room.game;
    if (g.phase !== 'await_rps' || !g.rps || g.rps.resolved) return;
    if (!['rock', 'paper', 'scissors'].includes(choice)) return;
    g.rps.picks[socket.id] = choice;
    const other = room.players.find((p) => p.id !== socket.id);
    const bothPicked = g.rps.picks[room.players[0].id] && g.rps.picks[room.players[1].id];
    if (bothPicked) {
      resolveRPS(room);
      setTimeout(() => { g.rps = null; advanceTurn(room, false); step(room); }, 50);
    } else if (!other || !other.connected) {
      // 对方掉线，当前出拳者直接获胜
      g.rps.picks[other.id] = 'lose';
      g.rps.result = { winner: socket.id, text: `${room.players.find(p=>p.id===socket.id).name} 胜（对方掉线）` };
      g.rps.resolved = true;
      g.rps.picks[socket.id] = choice;
      setTimeout(() => { g.rps = null; advanceTurn(room, false); step(room); }, 50);
    }
    step(room);
  });

  socket.on('quizAnswer', ({ idx }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.game) return;
    const g = room.game;
    if (g.phase !== 'await_quiz' || !g.quiz || g.quiz.answered) return;
    if (g.quiz.answerer !== socket.id) return;
    const player = room.players[g.current];
    g.quiz.answered = true;
    if (idx === g.quiz.a) {
      player.money += QUIZ_REWARD;
      g.lastEvent = { type: 'info', text: `答对 +${QUIZ_REWARD}` };
      pushLog(room, `${player.name} 答对，+${QUIZ_REWARD}。`);
    } else {
      player.money -= QUIZ_PENALTY;
      g.lastEvent = { type: 'info', text: `答错 -${QUIZ_PENALTY}` };
      pushLog(room, `${player.name} 答错，-${QUIZ_PENALTY}。`);
      checkBankrupt(room, player);
    }
    setTimeout(() => { g.quiz = null; advanceTurn(room, false); step(room); }, 50);
    step(room);
  });

  socket.on('jailAction', ({ pay }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.game) return;
    const g = room.game;
    if (g.phase !== 'await_roll') return;
    const player = room.players[g.current];
    if (player.id !== socket.id || !player.inJail) return;
    if (pay) {
      if (player.money < 50) return socket.emit('errorMsg', '钱不够交保释金');
      player.money -= 50; player.inJail = false; player.jailTurns = 0;
      pushLog(room, `${player.name} 交保释金50，立即出狱并掷骰。`);
      rollDice(room, player);
    } else {
      player.jailTurns++;
      pushLog(room, `${player.name} 选择继续关押(${player.jailTurns}/3)。`);
      if (player.jailTurns >= 3) {
        player.inJail = false; player.jailTurns = 0; player.money -= 50;
        pushLog(room, `${player.name} 关满3回合，交保释金50出狱。`);
        g.lastEvent = { type: 'info', text: '关满3回合，出狱' };
      } else {
        g.lastEvent = { type: 'info', text: '继续关押' };
        advanceTurn(room, false);
      }
    }
    step(room);
  });

  socket.on('restart', () => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;
    room.game = null;
    broadcast(room);
  });

  socket.on('chat', ({ text }) => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;
    const player = room.players.find((p) => p.id === socket.id);
    io.to(room.code).emit('chat', { name: player ? player.name : '?', text, color: player ? player.color : '#888' });
  });

  socket.on('disconnect', () => {
    for (const [code, room] of rooms) {
      const p = room.players.find((x) => x.id === socket.id);
      if (p) {
        p.connected = false; p.id = null;
        pushLog(room, `${p.name} 暂时掉线（可重连）。`);
        if (room.game && (room.game.phase === 'await_rps' || room.game.phase === 'await_quiz')) {
          skipPendingMinigame(room);
        }
        broadcast(room);
        if (room.players.every((x) => !x.connected)) scheduleCleanup(code);
      }
    }
  });
});

let cleanupTimers = {};
function scheduleCleanup(code) {
  if (cleanupTimers[code]) return;
  cleanupTimers[code] = setTimeout(() => {
    const room = rooms.get(code);
    if (room && room.players.every((x) => !x.connected)) {
      rooms.delete(code);
      delete cleanupTimers[code];
      deleteSave(code);
      console.log(`🧹 清理长期离线房间 ${code}`);
    }
  }, 30 * 60 * 1000);
}

function findRoomBySocket(id) {
  for (const room of rooms.values()) {
    if (room.players.some((p) => p.id === id)) return room;
  }
  return null;
}

loadSaves();
server.listen(PORT, () => {
  console.log(`💕 大富翁服务器已启动: http://localhost:${PORT}`);
});
