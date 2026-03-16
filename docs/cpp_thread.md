🛠️ C++ 多线程极简速查手册垂青的专属复习笔记：这里记录了从 C 语言 pthread 迁移到现代 C++ 多线程开发的核心知识点。像写 Word 一样往下加内容即可！1. 编译环境 (CMake 必备)脱离了命令行直接敲 GCC，使用 CMake 管理多线程项目的标准流程：1.1 核心 CMakeLists.txt 写法# 1. 声明 CMake 的最低版本要求
cmake_minimum_required(VERSION 3.10)

# 2. 设置项目名称
project(ThreadTest)

# 3. 寻找系统线程库 (最专业、最稳妥的写法，替代写死的 -lpthread)
find_package(Threads REQUIRED)

# 4. 指定生成的可执行文件名和源代码文件 (⚠️ 注意后缀一定是 .cpp，写成 .c 会报错！)
add_executable(create_test create_test.cpp)

# 5. 将线程库链接到你的可执行文件
target_link_libraries(create_test PRIVATE Threads::Threads)
1.2 标准编译三步曲在终端中（通常是在项目内新建的 build 文件夹里）执行：# 第一步：生成配置 (相当于“写菜单”，检查环境并生成 Makefile)
cmake ..

# 第二步：正式编译 (相当于“开火煮菜”，真正调用编译器生成二进制文件)
make

# 第三步：运行程序
./create_test
2. 头文件与基本起步抛弃繁琐的 <pthread.h> 及其一堆 void*，拥抱现代 C++：#include <thread>  // 核心：提供 std::thread
#include <chrono>  // 辅助：提供时间休眠功能
#include <vector>  // 辅助：用来批量管理线程
3. 线程的生命周期3.1 线程创建 (拉起队伍)| 操作 | 代码指令 | 白话解释 || 创建即启动 | std::thread t1(func_name); | 招募一个叫 t1 的工人，立刻去执行任务。 || 带参数创建 | std::thread t2(func, arg1, arg2); | 让工人去干活，顺便塞给他需要的工具。 || 传引用 (核心!) | std::thread t3(func, std::ref(num)); | 想让线程修改外面的变量，必须套一层 std::ref()！ |3.2 线程终止与休眠 (收工与摸鱼)在 C++ 中，std::thread 对象在销毁前必须明确其归宿（选择 join 还是 detach），否则程序会触发 std::terminate 导致直接崩溃。| 操作 | 代码指令 | 白话解释 || 等待结束 (阻塞) | t1.join(); | 主线程死等 t1 干完活再往下走。负责回收系统资源，最常用，绝对不能忘！ || 分离后台 (放养) | t1.detach(); | 让 t1 自己在后台跑，变成守护线程。脱离主线程管控。 || 状态检查 (防爆) | t1.joinable(); | 返回 bool 值，检查线程是否还可以被 join 或 detach。 || 跨平台休眠 | std::this_thread::sleep_for(std::chrono::milliseconds(10)); | 当前线程摸鱼 10 毫秒。告别系统的 sleep，实现完美跨平台。 |💡 进阶避坑指南：为什么必须 join()？ C++ 设计哲学要求你对资源绝对负责。主线程调用 join() 会被卡住，这能保证传给子线程的局部变量（引用/指针）依然存活，直到子线程安全退出。detach() 的致命诱惑：分离后线程会在后台自动释放资源。但强烈不建议在安防等高稳定性项目中使用！如果子线程使用了主线程局部变量的引用，而主线程先结束销毁了该变量，子线程再去读写就会产生野指针/内存越界，导致极难排查的随机崩溃（Segment Fault）。防爆金牌 joinable()：一个线程不能被重复 join()。工业级代码通常会先进行安全检查：if (t1.joinable()) { t1.join(); }。4. 工业级模板：用 Vector 批量管理线程遇到需要开 10 个、100 个线程的场景，绝对不要用 C 语言的原生数组，直接套用这个 Vector 模板：void worker(int& id) { 
    /* 干活逻辑 */ 
}

int main() {
    std::vector<std::thread> pool;
    int my_data = 100;

    // 1. 批量创建并派发任务
    for (int i = 0; i < 10; ++i) {
        pool.push_back(std::thread(worker, std::ref(my_data)));
    }

    // 2. 批量回收，等待所有工人下班
    for (auto& t : pool) {
        if (t.joinable()) { // 工业级安全检查
            t.join();
        }
    }
    
    return 0;
}
⚠️ 避坑警告：多线程不加锁（Mutex）直接修改同一个变量，必然导致 数据竞争 (Data Race)。现象就是：代码没报错，但最终算出来的结果就是不对（比如 20000 个线程最后结果只有 15000）！5. 互斥锁 (Mutex) 与数据保护(垂青，等你学完互斥锁的知识，直接在这里继续往下写即可！比如可以记录 std::mutex 和 std::lock_guard 的用法。)